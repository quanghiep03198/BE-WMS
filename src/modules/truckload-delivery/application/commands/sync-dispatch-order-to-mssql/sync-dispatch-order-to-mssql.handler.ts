import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { SYNC_DISPATCH_ORDER_QUEUE } from '../../../infrastructure/queues'
import { SyncDispatchOrderToMssqlCommand } from './sync-dispatch-order-to-mssql.command'

@CommandHandler(SyncDispatchOrderToMssqlCommand)
export class SyncDispatchOrderToMssqlHandler implements ICommandHandler<SyncDispatchOrderToMssqlCommand, void> {
	constructor(
		@InjectQueue(SYNC_DISPATCH_ORDER_QUEUE) private readonly syncDispatchOrderQueue: Queue<{ dispatchOrder: string }>
	) {}

	async execute({ dispatchOrder }: SyncDispatchOrderToMssqlCommand): Promise<void> {
		await this.syncDispatchOrderQueue.add('SYNC_DISPATCH_ORDER', { dispatchOrder })
	}
}
