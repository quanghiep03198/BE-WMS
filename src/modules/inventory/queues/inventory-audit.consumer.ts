import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { EventGateway } from '@/events/event.gateway'
import { OnQueueEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DataSource } from 'typeorm'
import { SYNC_INVENTORY_AUDIT_QUEUE } from '../constants'

/** Cache TTL: 5 minutes — đủ để client reconnect trong khoảng này vẫn nhận được state */
const SYNC_STATE_TTL_MS = 5 * 60 * 1000
const SYNC_STATE_CACHE_KEY = 'sync_states:inventory_audit'

type SyncStatus = 'progress' | 'completed' | 'failed'

export interface SyncStatePayload {
	event: string
	ok: boolean
	metadata: { status: SyncStatus }
	error: Error | null
}

@Processor({ name: SYNC_INVENTORY_AUDIT_QUEUE })
export class InventoryAuditDataSyncConsumer extends WorkerHost {
	private readonly SOCKET_EVENT = 'sync_inventory_audit_data'

	constructor(
		@InjectPinoLogger(InventoryAuditDataSyncConsumer.name)
		private readonly logger: PinoLogger,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource,
		private readonly eventGateway: EventGateway,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache
	) {
		super()
	}

	async process(): Promise<void> {
		this.logger.info('Inventory audit sync started')
		await this.broadcastSyncState('progress', true, null)
		const queryRunner = this.dataSource.createQueryRunner()
		try {
			await queryRunner.startTransaction()

			await queryRunner.query(/* SQL */ `EXEC DV_DATA_LAKE.dbo.sp_import_invprod_VER2`)
			await queryRunner.commitTransaction()

			await this.broadcastSyncState('completed', true, null)
			this.logger.info('Inventory audit sync completed')
		} catch (error) {
			if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
			this.logger.error({ err: error }, 'Inventory audit sync failed')
			await this.broadcastSyncState('failed', false, error as Error)
		} finally {
			await queryRunner.release()
			await this.cacheManager.del(SYNC_STATE_CACHE_KEY)
		}
	}

	/**
	 * Cập nhật trạng thái sync vào cache và broadcast ngay cho tất cả clients.
	 * Cache được giữ lại (không xóa sau khi xong) để client reconnect vẫn nhận được state cuối cùng.
	 */
	private async broadcastSyncState(status: SyncStatus, ok: boolean, error: Error | null): Promise<void> {
		const payload: SyncStatePayload = {
			event: this.SOCKET_EVENT,
			ok,
			metadata: { status },
			error
		}

		await this.cacheManager.set(SYNC_STATE_CACHE_KEY, SuperJson.stringify(payload), SYNC_STATE_TTL_MS)
		this.eventGateway.server.emit(this.SOCKET_EVENT, payload)
	}

	@OnQueueEvent('deduplicated')
	onDeduplicated(): void {
		this.logger.warn('Duplicated job detected, skipping')
	}
}
