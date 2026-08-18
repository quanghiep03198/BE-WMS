import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { getDataSourceToken } from '@nestjs/typeorm'
import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import { DataSource } from 'typeorm'
import { CDC_CHECKPOINT_REGISTRY_KEY } from '../constants'
import { CdcProvisionConfig } from '../types'
import { buildCaptureInstanceName, buildTableLabel, getCdcCheckpointKey } from '../utils'

interface ExistingCaptureConfig {
	supportsNetChanges: boolean
	columns: string[]
}

const SQL_ERROR_MISSING_PK_FOR_NET_CHANGES = 22942 as const

@Injectable()
export class CdcProvisionerService {
	private readonly logger = new Logger(CdcProvisionerService.name)
	private readonly dataSourceCache = new Map<string, DataSource>()

	constructor(
		private readonly moduleRef: ModuleRef,
		@InjectRedisClient() private readonly redis: Redis
	) {}

	async provisionAll(configs: CdcProvisionConfig[]): Promise<void> {
		for (const cfg of configs) {
			try {
				await this.provisionOne(cfg)
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err)
				const stackTrace = err instanceof Error ? err.stack : undefined

				this.logger.error(
					`Failed to provision CDC for ${buildTableLabel(cfg.schema, cfg.sourceName)}: ${errorMessage}`,
					stackTrace
				)
			}
		}
	}

	private async provisionOne(cfg: CdcProvisionConfig): Promise<void> {
		this.validateIdentifiers(cfg)

		const dataSource = this.resolveDataSource(cfg.dataSourceToken)
		const captureInstance = buildCaptureInstanceName(cfg.schema, cfg.sourceName)
		const checkpointKey = getCdcCheckpointKey(cfg.dataSourceToken, cfg.schema, cfg.sourceName)
		const tableLabel = buildTableLabel(cfg.schema, cfg.sourceName)

		await this.ensureDbLevelCdc(dataSource)

		const existing = await this.getExistingConfig(dataSource, cfg.schema, cfg.sourceName, captureInstance)

		if (!existing) {
			await this.enableTable(dataSource, cfg, captureInstance)
			await this.registerCheckpointKey(checkpointKey)
			this.logger.log(`Created new CDC capture instance: ${captureInstance}`)
			return
		}

		const desiredSignature = this.buildSignature(cfg.capturedColumns, cfg.supportsNetChanges)
		const existingSignature = this.buildSignature(existing.columns, existing.supportsNetChanges)

		if (desiredSignature === existingSignature) {
			this.logger.debug(`CDC config for ${captureInstance} is already up to date, skipping`)
			return
		}

		this.logger.warn(`CDC config for ${captureInstance} has changed — disabling and recreating`)

		await dataSource.query(/* SQL */ `
      EXEC sys.sp_cdc_disable_table
        @source_schema    = N'${cfg.schema}',
        @source_name      = N'${cfg.sourceName}',
        @capture_instance = N'${captureInstance}';
    `)

		await this.enableTable(dataSource, cfg, captureInstance)
		await this.registerCheckpointKey(checkpointKey)

		// The recreated capture instance has a completely new LSN range — the old checkpoint
		// is meaningless and would cause "invalid LSN range" errors or silently miss changes.
		await this.redis.del(checkpointKey)
		this.logger.warn(`Reset Redis checkpoint: ${checkpointKey} (table: ${tableLabel})`)
	}

	private async ensureDbLevelCdc(dataSource: DataSource): Promise<void> {
		const [{ is_cdc_enabled }] = await dataSource.query(
			`SELECT is_cdc_enabled FROM sys.databases WHERE name = DB_NAME()`
		)
		if (!is_cdc_enabled) {
			this.logger.warn(`CDC not enabled at database level — enabling now...`)
			await dataSource.query(`EXEC sys.sp_cdc_enable_db`)
		}
	}

	private async getExistingConfig(
		dataSource: DataSource,
		schema: string,
		sourceName: string,
		captureInstance: string
	): Promise<ExistingCaptureConfig | null> {
		const changeTableRows = await dataSource.query(
			/* SQL */ `
      SELECT ct.supports_net_changes
      FROM cdc.change_tables ct
      JOIN sys.tables t ON t.object_id = ct.source_object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      WHERE s.name = @0 AND t.name = @1 AND ct.capture_instance = @2
      `,
			[schema, sourceName, captureInstance]
		)

		if (changeTableRows.length === 0) return null

		const columnRows = await dataSource.query(
			/* SQL */ `
      SELECT cc.column_name
      FROM cdc.captured_columns cc
      JOIN cdc.change_tables ct ON ct.object_id = cc.object_id
      WHERE ct.capture_instance = @0
      ORDER BY cc.column_ordinal
      `,
			[captureInstance]
		)

		return {
			supportsNetChanges: !!changeTableRows[0].supports_net_changes,
			columns: columnRows.map((r: any) => r.column_name)
		}
	}

	private async enableTable(dataSource: DataSource, cfg: CdcProvisionConfig, captureInstance: string): Promise<void> {
		const roleNameSql = cfg.roleName ? `N'${cfg.roleName}'` : 'NULL'

		try {
			await dataSource.query(/* SQL */ `
        EXEC sys.sp_cdc_enable_table
          @source_schema        = N'${cfg.schema}',
          @source_name          = N'${cfg.sourceName}',
          @capture_instance     = N'${captureInstance}',
          @role_name            = ${roleNameSql},
          @captured_column_list = N'${cfg.capturedColumns.join(', ')}',
          @supports_net_changes = ${cfg.supportsNetChanges ? 1 : 0};
      `)
		} catch (err) {
			if (this.isMissingPkForNetChangesError(err)) {
				throw new Error(
					`Table ${buildTableLabel(cfg.schema, cfg.sourceName)} has no Primary Key — cannot enable supportsNetChanges=true. ` +
						`Add a PK to the table, or set supportsNetChanges=false in the config.`
				)
			}
			throw err
		}
	}

	private isMissingPkForNetChangesError(err: any): boolean {
		const candidates = [
			err?.number,
			err?.originalError?.number,
			err?.originalError?.info?.number,
			err?.driverError?.number,
			err?.driverError?.originalError?.info?.number
		]
		return candidates.includes(SQL_ERROR_MISSING_PK_FOR_NET_CHANGES)
	}

	private async registerCheckpointKey(checkpointKey: string): Promise<void> {
		await this.redis.sadd(CDC_CHECKPOINT_REGISTRY_KEY, checkpointKey)
	}

	private buildSignature(columns: string[], supportsNetChanges: boolean): string {
		const normalized = [...columns]
			.map((c) => c.toLowerCase())
			.sort()
			.join(',')
		return `${normalized}|${supportsNetChanges}`
	}

	private validateIdentifiers(cfg: CdcProvisionConfig): void {
		const identifierPattern = /^[a-zA-Z0-9_]+$/
		const toCheck = [cfg.schema, cfg.sourceName, ...cfg.capturedColumns]
		for (const id of toCheck) {
			if (!identifierPattern.test(id)) {
				throw new Error(`Invalid identifier in CDC config: '${id}'`)
			}
		}
	}

	private resolveDataSource(token: string): DataSource {
		let ds = this.dataSourceCache.get(token)
		if (!ds) {
			ds = this.moduleRef.get<DataSource>(getDataSourceToken(token), { strict: false })
			if (!ds) throw new Error(`DataSource not found for token: ${token}`)
			this.dataSourceCache.set(token, ds)
		}
		return ds
	}
}
