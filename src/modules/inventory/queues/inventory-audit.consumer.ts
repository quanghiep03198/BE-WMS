import { EventGateway } from '@/events/event.gateway'
import { TenancyService } from '@/modules/tenancy/tenancy.service'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger as NestLogger, Scope } from '@nestjs/common'
import { Job } from 'bullmq'
import { format } from 'date-fns'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { Logger } from 'winston'
import { InventoryType, SYNC_INVENTORY_AUDIT_QUEUE } from '../constants'
import { InventoryAuditEntity } from '../entities/inventory-report.entity'

@Processor({ name: SYNC_INVENTORY_AUDIT_QUEUE, scope: Scope.REQUEST })
export class InventoryAuditDataSyncConsumer extends WorkerHost {
	private readonly socketEvent = 'sync_inventory_audit_data'

	constructor(
		@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
		private readonly tenancyService: TenancyService, // Replace 'any' with the actual type of your data source
		private readonly eventGateway: EventGateway
	) {
		super()
	}

	async process({ id }: Job<object>) {
		NestLogger.log('Inventory audit sync in progress', InventoryAuditDataSyncConsumer.name)
		const currentTenant = this.tenancyService.findOneById(id)
		const dataSource = await this.tenancyService.getTenancyDataSource(currentTenant?.host)
		const queryRunner = dataSource.createQueryRunner()
		try {
			await queryRunner.startTransaction()
			this.broadcastProgress({
				metadata: { status: 'progress' },
				event: this.socketEvent,
				ok: true,
				error: null
			})
			await queryRunner.manager.getRepository(InventoryAuditEntity).delete({
				inv_type: InventoryType.FINISHED_GOOD,
				inv_year_month: format(new Date(), 'yyyyMM')
			})
			await queryRunner.query(/* SQL */ `EXEC DV_DATA_LAKE.dbo.sp_import_invprod_VER2`)
			await queryRunner.commitTransaction()
			this.broadcastProgress({
				metadata: { status: 'completed' },
				event: this.socketEvent,
				ok: true,
				error: null
			})
			NestLogger.log('Inventory audit sync completed', InventoryAuditDataSyncConsumer.name)
		} catch (error) {
			queryRunner.rollbackTransaction()
			this.logger.error(error)
			this.broadcastProgress({
				metadata: { status: 'failed' },
				event: this.socketEvent,
				ok: false,
				error: error as Error
			})
		}
	}

	private broadcastProgress(data: WsResponseBody<{ status: 'progress' | 'completed' | 'failed' }>) {
		this.eventGateway.server.emit('sync_inventory_audit_data', data)
	}
}
