import { SYNC_INVENTORY_AUDIT_QUEUE } from '@modules/inventory/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { format } from 'date-fns'
import { SyncInventoryAuditCommand } from './sync-inventory-audit.command'

/**
 * @deprecated Due to the large volume of data, this command is now handled asynchronously through a queue system. The synchronous approach has been deprecated to improve performance and reliability.
 */
@CommandHandler(SyncInventoryAuditCommand)
export class SyncInventoryAuditHandler implements ICommandHandler<SyncInventoryAuditCommand> {
	constructor(
		@InjectQueue(SYNC_INVENTORY_AUDIT_QUEUE)
		private readonly syncInventoryAuditQueue: Queue<{ year: number; month: number }>
	) {}

	public async execute({ yearMonth }: SyncInventoryAuditCommand) {
		return this.syncInventoryAuditQueue.add('SYNC_INVENTORY_AUDIT', yearMonth, {
			jobId: format(new Date(yearMonth.year, yearMonth.month - 1), 'yyyy-MM'),
			removeOnComplete: true,
			removeOnFail: false,
			attempts: 3,
			delay: 1000 * 60 * 5,
			backoff: {
				type: 'exponential',
				delay: 1000 * 60 * 5
			}
		})
	}
}
