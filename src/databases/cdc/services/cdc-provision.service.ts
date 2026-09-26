import { Bit } from '@databases/transformers/bool.transformer'
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

	/**
	 * * Provision and configure CDC for all specified tables.
	 * * Chuẩn bị và cấu hình CDC cho tất cả các bảng được chỉ định trong mảng configs.
	 * @param configs
	 */
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

	/**
	 * * Provision and configure CDC for a single table.
	 * * Chuẩn bị và cấu hình CDC cho một bảng duy nhất.
	 * @param cfg
	 * @returns
	 */
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

	/**
	 * * Ensure that CDC is enabled at the database level.
	 * * Đảm bảo rằng CDC được bật ở cấp cơ sở dữ liệu.
	 * @param dataSource
	 */
	private async ensureDbLevelCdc(dataSource: DataSource): Promise<void> {
		const [{ is_cdc_enabled }] = await dataSource.query(
			`SELECT is_cdc_enabled FROM sys.databases WHERE name = DB_NAME()`
		)
		if (!is_cdc_enabled) {
			this.logger.warn(`CDC not enabled at database level — enabling now...`)
			await dataSource.query(`EXEC sys.sp_cdc_enable_db`)
		}
	}

	/**
	 * * Retrieve the existing CDC configuration for a specific table.
	 * * Lấy cấu hình CDC hiện có cho một bảng cụ thể.
	 * @param dataSource
	 * @param schema
	 * @param sourceName
	 * @param captureInstance
	 * @returns
	 */
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

	/**
	 * * Enable CDC for a specific table.
	 * * Bật CDC cho một bảng cụ thể.
	 * @param dataSource
	 * @param cfg
	 * @param captureInstance
	 */
	private async enableTable(dataSource: DataSource, cfg: CdcProvisionConfig, captureInstance: string): Promise<void> {
		const { schema, sourceName, capturedColumns, roleName, indexName, supportsNetChanges } = cfg

		const roleNameSql = roleName ? `N'${roleName}'` : 'NULL'
		const indexNameSql = indexName ? `N'${indexName}'` : 'NULL'
		const supportsNetChangesSql: Bit = supportsNetChanges ? 1 : 0
		const capturedColumnListSql = `N'${cfg.capturedColumns.join(', ')}'`

		try {
			await dataSource.query(/* SQL */ `
        EXEC sys.sp_cdc_enable_table
          @source_schema        = N'${schema}',
          @source_name          = N'${sourceName}',
          @capture_instance     = N'${captureInstance}',
          @role_name            = ${roleNameSql},
          @captured_column_list = ${capturedColumnListSql},
			 @index_name           = ${indexNameSql},
          @supports_net_changes = ${supportsNetChangesSql};
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

	/**
	 * * Check if the error is related to a missing primary key when `supportsNetChanges` is enabled.
	 * * Kiểm tra xem lỗi có liên quan đến việc thiếu khóa chính khi `supportsNetChanges` được bật hay không.
	 * @param err
	 * @returns
	 */
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
