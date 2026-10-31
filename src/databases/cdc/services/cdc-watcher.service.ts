import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { InjectModel } from '@nestjs/mongoose'
import { getDataSourceToken } from '@nestjs/typeorm'
import Redis from 'ioredis'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'

import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { InjectRedisClient } from '@redis/decorators'
import { CdcQuarantine, CdcQuarantineModel } from '../schemas/cdc-quarantine.schema'
import { CdcOperation } from '../types'
import { buildCaptureInstanceName, buildTableLabel, getCdcCheckpointKey, groupCdcChanges } from '../utils'
import { CdcEchoRegistryService } from './cdc-echo-registery.service'
import { DiscoveredCdcHandler } from './cdc-explorer.service'

/** Số dòng CDC xử lý mỗi lượt: lọc echo -> gom nhóm -> gọi handler. */
const BATCH_SIZE = 5000

/**
 * TTL mặc định của lock. Lock được gia hạn sau mỗi batch và được nhả ngay khi poll xong,
 * nên TTL chỉ để cứu trường hợp process chết giữa chừng.
 */
const DEFAULT_LOCK_TTL_MS = 60_000

/** Thời gian cache cờ supports_net_changes (tránh query cdc.change_tables mỗi giây). */
const NET_CHANGES_CACHE_TTL_MS = 60_000

/**
 * Số dòng CDC tối đa (xấp xỉ) cho mỗi lượt đọc. Một transaction lớn hơn ngưỡng này vẫn được đọc nguyên vẹn.
 * Giới hạn này chặn đỉnh bộ nhớ khi backlog lớn, phần còn lại được đọc ở lượt kế tiếp.
 */
const WINDOW_ROWS = 20_000

/** Chỉ xóa lock nếu mình vẫn là chủ sở hữu. */
const RELEASE_LOCK_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`

/**
 * Gia hạn lock nếu mình vẫn là chủ sở hữu. Nếu lock đã hết hạn và chưa ai lấy (query đọc lâu hơn TTL)
 * thì lấy lại luôn thay vì bỏ lượt poll, tránh vòng lặp "đọc xong -> mất lock -> bỏ -> đọc lại".
 * Lock đang do instance khác giữ thì trả về 0.
 */
const RENEW_LOCK_SCRIPT = `
local current = redis.call('get', KEYS[1])
if current == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) end
if not current then redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2]) return 1 end
return 0`

interface FilteredRecord {
	operation: CdcOperation
	row: Record<string, any>
	lsn: Buffer
	commandId: Buffer
}

interface PollLock {
	key: string
	token: string
	ttlMs: number
}

/**
 * Kết quả một lượt poll, để scheduler quyết định bao giờ poll tiếp:
 * - idle: hết dữ liệu mới, chờ đủ pollIntervalMs
 * - more: còn backlog, poll tiếp ngay
 * - busy: bảng đang được xử lý (ở process này hoặc instance khác), chờ đủ pollIntervalMs
 * - error: lượt poll lỗi, scheduler lùi dần (backoff)
 */
export type CdcPollOutcome = 'idle' | 'more' | 'busy' | 'error'

@Injectable()
export class CdcWatcherService {
	private readonly logger = new Logger(CdcWatcherService.name)
	private readonly dataSourceCache = new Map<string, DataSource>()
	private readonly netChangesCache = new Map<string, { value: boolean; expiresAt: number }>()

	/** Các bảng process này đang poll dở. Chặn tick kế tiếp chạy chồng lên tick trước. */
	private readonly inFlight = new Set<string>()

	constructor(
		private readonly moduleRef: ModuleRef,
		@InjectRedisClient() private readonly redis: Redis,
		private readonly echoRegistry: CdcEchoRegistryService,
		@InjectModel(CdcQuarantine.name, DATA_WAREHOUSE_CONNECTION) private readonly quarantineModel: CdcQuarantineModel
	) {}

	async watchTable(handler: DiscoveredCdcHandler, signal?: AbortSignal): Promise<CdcPollOutcome> {
		const { options } = handler
		const lock: PollLock = {
			key: `cdc:lock:${options.dataSourceToken}:${options.schema}.${options.sourceName}`,
			token: randomUUID(),
			ttlMs: options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS
		}

		// Lượt poll trước của bảng này chưa xong thì bỏ qua tick này.
		if (this.inFlight.has(lock.key)) return 'busy'
		this.inFlight.add(lock.key)

		let acquired = false
		try {
			acquired = (await this.redis.set(lock.key, lock.token, 'PX', lock.ttlMs, 'NX')) === 'OK'
			if (!acquired) return 'busy'

			return await this.poll(handler, lock, signal)
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)
			const stackTrace = err instanceof Error ? err.stack : undefined
			const tableLabel = buildTableLabel(options.schema, options.sourceName)

			this.logger.error(`CDC watch failed for ${options.dataSourceToken}.${tableLabel}: ${errorMessage}`, stackTrace)
			return 'error'
		} finally {
			if (acquired) {
				await this.releaseLock(lock).catch((err) =>
					this.logger.warn(`Failed to release CDC lock ${lock.key}: ${err instanceof Error ? err.message : err}`)
				)
			}
			this.inFlight.delete(lock.key)
		}
	}

	/**
	 * @description Một lượt poll: đọc một cửa sổ thay đổi (checkpoint, to_lsn] gồm khoảng WINDOW_ROWS dòng,
	 * rồi xử lý theo từng batch. Checkpoint chỉ được lưu sau khi mọi batch trong cửa sổ đã xử lý xong.
	 * Nếu lượt poll dừng giữa chừng (lỗi, mất lock, shutdown), lượt sau sẽ đọc lại từ checkpoint cũ,
	 * nên handler phải idempotent (upsert theo khóa).
	 * @returns 'more' nếu còn backlog phía sau cửa sổ này
	 */
	private async poll(
		{ options, instance }: DiscoveredCdcHandler,
		lock: PollLock,
		signal?: AbortSignal
	): Promise<CdcPollOutcome> {
		const startedAt = Date.now()
		const captureInstance = buildCaptureInstanceName(options.schema, options.sourceName)
		const tableLabel = buildTableLabel(options.schema, options.sourceName)
		const checkpointKey = getCdcCheckpointKey(options.dataSourceToken, options.schema, options.sourceName)
		const dataSource = this.resolveDataSource(options.dataSourceToken)

		const lastLsnHex = await this.redis.get(checkpointKey)
		const range = await this.getLsnRange(
			dataSource,
			captureInstance,
			lastLsnHex ? Buffer.from(lastLsnHex, 'hex') : null
		)
		if (!range) return 'idle' // chưa có thay đổi mới
		const { fromLsn } = range
		const { toLsn, hasMore } = await this.resolveWindow(dataSource, captureInstance, fromLsn, range.maxLsn)
		const outcome: CdcPollOutcome = hasMore ? 'more' : 'idle'

		const supportsNetChanges = await this.getSupportsNetChanges(dataSource, options.dataSourceToken, captureInstance)

		const originColumnSelect = options.originMarkerColumn
			? `*, sys.fn_cdc_has_column_changed('${captureInstance}', '${options.originMarkerColumn}', __$update_mask) AS __origin_changed`
			: '*'
		const changeFunction = supportsNetChanges ? 'net_changes' : 'all_changes'
		const rowFilterOption = supportsNetChanges ? 'all with mask' : 'all'

		const rawChanges: Record<string, any>[] = await dataSource.query(
			`SELECT ${originColumnSelect} FROM cdc.fn_cdc_get_${changeFunction}_${captureInstance}(@0, @1, '${rowFilterOption}')`,
			[fromLsn, toLsn]
		)

		let skippedEchoes = 0
		let handled = 0

		for (let offset = 0; offset < rawChanges.length; offset += BATCH_SIZE) {
			// Đang shutdown: dừng ngay, không lưu checkpoint (lượt sau đọc lại, handler idempotent).
			if (signal?.aborted) return 'idle'

			// Mất lock (hết hạn hoặc bị lấy mất) thì dừng, không lưu checkpoint.
			if (!(await this.renewLock(lock))) {
				this.logger.warn(`Lost CDC lock for ${options.dataSourceToken}.${tableLabel}, aborting this poll`)
				return 'busy'
			}

			const slice = rawChanges.slice(offset, offset + BATCH_SIZE)
			const { records, skipped } = await this.filterEchoes(slice, options, supportsNetChanges)
			skippedEchoes += skipped

			if (records.length > 0) {
				handled += records.length
				await this.processGroups(instance, tableLabel, options.dataSourceToken, groupCdcChanges(records))
			}
		}

		await this.redis.set(checkpointKey, toLsn.toString('hex'))

		if (rawChanges.length > 0) {
			this.logger.debug(
				`${tableLabel}: read ${rawChanges.length} row(s), skipped ${skippedEchoes} echo(es), handled ${handled} in ${Date.now() - startedAt}ms${hasMore ? ' (backlog remains)' : ''}`
			)
		}

		return outcome
	}

	/**
	 * @description Chuyển các dòng thô thành FilteredRecord và loại các dòng echo (do chính hệ thống ghi).
	 * Kiểm tra echo theo lô bằng một pipeline Redis thay vì từng dòng.
	 */
	private async filterEchoes(
		rows: Record<string, any>[],
		options: DiscoveredCdcHandler['options'],
		supportsNetChanges: boolean
	): Promise<{ records: FilteredRecord[]; skipped: number }> {
		const marker = options.originMarkerColumn
		const candidates: Array<{ record: FilteredRecord; originId?: string }> = []

		for (const row of rows) {
			const { __$operation, __$update_mask, __$seqval, __$command_id, __$start_lsn, __origin_changed, ...data } = row

			// all_changes trả cả before-image (3) và after-image (4) cho update; handler chỉ dùng after-image.
			if (!supportsNetChanges && __$operation === 3) continue

			const originId = marker && __origin_changed === 1 && data[marker] ? String(data[marker]) : undefined

			candidates.push({
				record: {
					operation: this.mapOperation(__$operation),
					row: data,
					lsn: __$start_lsn,
					commandId: __$command_id
				},
				originId
			})
		}

		const originIds = [...new Set(candidates.flatMap(({ originId }) => (originId ? [originId] : [])))]
		const echoes =
			originIds.length > 0
				? await this.echoRegistry.consumeManyIfOrigin(
						options.dataSourceToken,
						options.schema,
						options.sourceName,
						originIds
					)
				: new Set<string>()

		const records: FilteredRecord[] = []
		let skipped = 0
		for (const { record, originId } of candidates) {
			if (originId && echoes.has(originId)) {
				skipped++
				continue
			}
			records.push(record)
		}
		return { records, skipped }
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

			await this.quarantineModel.insertMany(quarantineDocs, { ordered: false })

			this.logger.warn(
				`Quarantined ${quarantineDocs.length} row(s) across ${groups.length} group(s) from ${dataSourceToken}.${tableLabel}: ${errorMessage}`
			)
		}
	}

	/**
	 * @description Tính khoảng LSN cần đọc.
	 * - Có checkpoint: bắt đầu từ LSN KẾ TIẾP (fn_cdc_increment_lsn) để không đọc lại transaction cuối của lượt trước.
	 *   Đọc lại sẽ khiến các dòng echo (marker đã bị tiêu thụ) bị coi là thay đổi thật.
	 * - Chưa có checkpoint: bắt đầu từ min LSN.
	 * - Checkpoint cũ hơn min LSN (CDC cleanup đã dọn): quay về min LSN, nếu không hàm CDC sẽ báo lỗi.
	 * @returns null nếu chưa có thay đổi mới
	 */
	private async getLsnRange(
		dataSource: DataSource,
		captureInstance: string,
		lastLsn: Buffer | null
	): Promise<{ fromLsn: Buffer; maxLsn: Buffer } | null> {
		const [row] = lastLsn
			? await dataSource.query(
					`SELECT sys.fn_cdc_get_min_lsn(@0) AS min_lsn, sys.fn_cdc_get_max_lsn() AS max_lsn, sys.fn_cdc_increment_lsn(@1) AS next_lsn`,
					[captureInstance, lastLsn]
				)
			: await dataSource.query(`SELECT sys.fn_cdc_get_min_lsn(@0) AS min_lsn, sys.fn_cdc_get_max_lsn() AS max_lsn`, [
					captureInstance
				])

		const minLsn: Buffer | null = row?.min_lsn ?? null
		const maxLsn: Buffer | null = row?.max_lsn ?? null
		if (!minLsn || !maxLsn) return null

		let fromLsn: Buffer = row.next_lsn ?? minLsn
		if (Buffer.compare(fromLsn, minLsn) < 0) {
			this.logger.warn(
				`Checkpoint of ${captureInstance} is older than the CDC retention window; resuming from min LSN (changes may have been cleaned up)`
			)
			fromLsn = minLsn
		}

		if (Buffer.compare(fromLsn, maxLsn) > 0) return null
		return { fromLsn, maxLsn }
	}

	/**
	 * @description Giới hạn `to_lsn` để một lượt đọc chứa khoảng WINDOW_ROWS dòng. Lấy WINDOW_ROWS dòng đầu của bảng
	 * thay đổi (`cdc.<capture_instance>_CT`) theo thứ tự LSN rồi lấy LSN lớn nhất trong đó làm `to_lsn`
	 * (đọc trọn transaction chứa nó). Nếu số dòng trong khoảng ít hơn ngưỡng thì đọc đến max LSN.
	 * Truy vấn chỉ quét tối đa WINDOW_ROWS dòng trên khóa cụm của bảng CT nên rẻ, kể cả khi backlog rất lớn.
	 */
	private async resolveWindow(
		dataSource: DataSource,
		captureInstance: string,
		fromLsn: Buffer,
		maxLsn: Buffer
	): Promise<{ toLsn: Buffer; hasMore: boolean }> {
		const [row] = await dataSource.query(
			`SELECT MAX(__$start_lsn) AS to_lsn, COUNT_BIG(*) AS cnt FROM (
				SELECT TOP (${WINDOW_ROWS}) __$start_lsn
				FROM cdc.${captureInstance}_CT
				WHERE __$start_lsn >= @0 AND __$start_lsn <= @1
				ORDER BY __$start_lsn, __$seqval
			) AS w`,
			[fromLsn, maxLsn]
		)

		const count = Number(row?.cnt ?? 0)
		const windowEnd: Buffer | null = row?.to_lsn ?? null
		if (!windowEnd || count < WINDOW_ROWS) return { toLsn: maxLsn, hasMore: false }

		return { toLsn: windowEnd, hasMore: Buffer.compare(windowEnd, maxLsn) < 0 }
	}

	private async renewLock({ key, token, ttlMs }: PollLock): Promise<boolean> {
		return (await this.redis.eval(RENEW_LOCK_SCRIPT, 1, key, token, ttlMs)) === 1
	}

	private async releaseLock({ key, token }: PollLock): Promise<void> {
		await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token)
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

	private async getSupportsNetChanges(
		dataSource: DataSource,
		dataSourceToken: string,
		captureInstance: string
	): Promise<boolean> {
		const cacheKey = `${dataSourceToken}:${captureInstance}`
		const cached = this.netChangesCache.get(cacheKey)
		if (cached && cached.expiresAt > Date.now()) return cached.value

		const rows = await dataSource.query(
			`SELECT supports_net_changes FROM cdc.change_tables WHERE capture_instance = @0`,
			[captureInstance]
		)
		if (rows.length === 0) throw new Error(`CDC capture instance not found: ${captureInstance}`)

		const value = Boolean(rows[0].supports_net_changes)
		this.netChangesCache.set(cacheKey, { value, expiresAt: Date.now() + NET_CHANGES_CACHE_TTL_MS })
		return value
	}
}
