import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { InjectModel } from '@nestjs/mongoose'
import { getDataSourceToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import Redis from 'ioredis'
import { CdcOperation } from '../types'
import { DiscoveredCdcHandler } from './cdc-explorer.service'

import { InjectRedisClient } from '@redis/decorators'
import { CdcQuarantine, CdcQuarantineModel } from '../schemas/cdc-quarantine.schema'
import { buildCaptureInstanceName, buildTableLabel, getCdcCheckpointKey, groupCdcChanges } from '../utils'

import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { CdcEchoRegistryService } from './cdc-echo-registery.service'

interface FilteredRecord {
	operation: CdcOperation
	row: Record<string, any>
	lsn: Buffer
	commandId: Buffer
}

@Injectable()
export class CdcWatcherService {
	private readonly logger = new Logger(CdcWatcherService.name)
	private readonly dataSourceCache = new Map<string, DataSource>()

	constructor(
		private readonly moduleRef: ModuleRef,
		@InjectRedisClient() private readonly redis: Redis,
		private readonly echoRegistry: CdcEchoRegistryService,
		@InjectModel(CdcQuarantine.name, DATA_WAREHOUSE_CONNECTION) private readonly quarantineModel: CdcQuarantineModel
	) {}

	async watchTable({ options, instance }: DiscoveredCdcHandler): Promise<void> {
		const captureInstance = buildCaptureInstanceName(options.schema, options.sourceName)
		const tableLabel = buildTableLabel(options.schema, options.sourceName)
		const checkpointKey = getCdcCheckpointKey(options.dataSourceToken, options.schema, options.sourceName)
		const lockKey = `cdc:lock:${options.dataSourceToken}:${options.schema}.${options.sourceName}`
		const lockTtl = options.lockTtlMs ?? Math.floor(options.pollIntervalMs * 0.9)

		const acquired = await this.redis.set(lockKey, '1', 'PX', lockTtl, 'NX')
		if (!acquired) return

		try {
			const dataSource = this.resolveDataSource(options.dataSourceToken)

			const [{ max_lsn }] = await dataSource.query(`SELECT sys.fn_cdc_get_max_lsn() AS max_lsn`)
			const lastLsnHex = await this.redis.get(checkpointKey)
			const lastLsn = lastLsnHex ? Buffer.from(lastLsnHex, 'hex') : await this.getMinLsn(dataSource, captureInstance)

			if (Buffer.compare(lastLsn, max_lsn) >= 0) return

			const originColumnSelect = options.originMarkerColumn
				? `* , sys.fn_cdc_has_column_changed('${captureInstance}', '${options.originMarkerColumn}', __$update_mask) AS __origin_changed`
				: '*'
			const fromLsnHex = lastLsn.toString('hex')
			const toLsnHex = max_lsn.toString('hex')

			const rawChanges = await dataSource.query(
				`SELECT ${originColumnSelect} FROM cdc.fn_cdc_get_net_changes_${captureInstance}(@0, @1, 'all with mask')`,
				[lastLsn, max_lsn]
			)

			if (rawChanges.length === 0) {
				await this.redis.set(checkpointKey, max_lsn.toString('hex'))
				return
			}

			// Lọc echo TRƯỚC khi nhóm — đảm bảo mỗi group chỉ chứa row cần xử lý thật sự
			const filtered: FilteredRecord[] = []

			for (const row of rawChanges) {
				const { __$operation, __$update_mask, __$seqval, __$command_id, __$start_lsn, __origin_changed, ...data } =
					row

				if (options.originMarkerColumn && __origin_changed === 1) {
					const originId = data[options.originMarkerColumn]
					if (originId) {
						const isEcho = await this.echoRegistry.consumeIfOrigin(
							options.dataSourceToken,
							options.schema,
							options.sourceName,
							originId
						)
						if (isEcho) {
							this.logger.debug(`Skipped self-echo for ${tableLabel} (origin=${originId})`)
							continue
						}
					}
				}

				filtered.push({
					operation: this.mapOperation(__$operation),
					row: data,
					lsn: __$start_lsn,
					commandId: __$command_id
				})
			}

			if (filtered.length > 0) {
				const groups = groupCdcChanges(filtered)
				await this.processGroups(instance, tableLabel, options.dataSourceToken, groups)
			}

			await this.redis.set(checkpointKey, max_lsn.toString('hex'))
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)
			const stackTrace = err instanceof Error ? err.stack : undefined

			this.logger.error(`CDC watch failed for ${options.dataSourceToken}.${tableLabel}: ${errorMessage}`, stackTrace)
		} finally {
			await this.redis.del(lockKey)
		}
	}

	/**
	 * @description Processes grouped CDC changes by invoking the handler instance. If an error occurs during processing, the affected rows are quarantined for later inspection.
	 * @param instance
	 * @param tableLabel
	 * @param dataSourceToken
	 * @param groups
	 */
	private async processGroups(
		instance: DiscoveredCdcHandler['instance'],
		tableLabel: string,
		dataSourceToken: string,
		groups: ReturnType<typeof groupCdcChanges>
	): Promise<void> {
		try {
			await instance.handle({ table: tableLabel, changes: groups })
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)

			const quarantineDocs = groups.flatMap((group) =>
				group.data.map((row) => ({
					sourceTable: tableLabel,
					dataSourceToken,
					rawPayload: row,
					error: errorMessage,
					lsn: Buffer.from(group.lsn, 'hex'),
					quarantinedAt: new Date()
				}))
			)

			await this.quarantineModel.insertMany(quarantineDocs)

			this.logger.warn(
				`Quarantined ${quarantineDocs.length} row(s) across ${groups.length} group(s) from ${dataSourceToken}.${tableLabel}: ${errorMessage}`
			)
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

	private mapOperation(code: number): CdcOperation {
		switch (code) {
			case 1:
				return 'delete'
			case 2:
				return 'insert'
			case 4:
				return 'update'
			default:
				throw new Error(`Unknown CDC operation code: ${code}`)
		}
	}

	private async getMinLsn(dataSource: DataSource, captureInstance: string): Promise<Buffer> {
		const [{ min_lsn }] = await dataSource.query(`SELECT sys.fn_cdc_get_min_lsn(@0) AS min_lsn`, [captureInstance])
		return min_lsn
	}
}
