import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { EventGateway } from '@/events/event.gateway'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger as NestLogger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { DataSource } from 'typeorm'
import { Logger } from 'winston'
import { SYNC_INVENTORY_AUDIT_QUEUE } from '../constants'

@Processor(SYNC_INVENTORY_AUDIT_QUEUE)
export class InventoryAuditDataSyncConsumer extends WorkerHost {
	private readonly socketEvent = 'sync_inventory_audit_data'

	constructor(
		@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource,
		private readonly eventGateway: EventGateway
	) {
		super()
	}

	async process() {
		NestLogger.debug('Inventory audit sync in progress')
		try {
			this.broadcastProgress({
				metadata: { status: 'progress' },
				event: this.socketEvent,
				ok: true,
				error: null
			})
			await this.dataSource.query(/* SQL */ `EXEC sp_import_invprod_VER2`)
			this.broadcastProgress({
				metadata: { status: 'completed' },
				event: this.socketEvent,
				ok: true,
				error: null
			})
		} catch (error) {
			this.logger.log('error', error)
			this.broadcastProgress({
				metadata: { status: 'failed' },
				event: this.socketEvent,
				ok: false,
				error
			})
		}
	}

	private broadcastProgress(data: WsResponseBody<{ status: 'progress' | 'completed' | 'failed' }>) {
		this.eventGateway.server.emit('sync_inventory_audit_data', data)
	}
}
