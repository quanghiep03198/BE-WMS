import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { DEFECTIVE_GOODS_SYNC_QUEUE } from '../../../infrastructure/queues'
import { SyncDefectiveGoodsCommand } from './sync-defective-goods.command'

@CommandHandler(SyncDefectiveGoodsCommand)
export class SyncDefectiveGoodsHandler implements ICommandHandler<SyncDefectiveGoodsCommand> {
	constructor(@InjectQueue(DEFECTIVE_GOODS_SYNC_QUEUE) private readonly queue: Queue<SyncDefectiveGoodsCommand>) {}
	async execute(command: SyncDefectiveGoodsCommand) {
		await this.queue.add('SYNC_DEFECTIVE_GOODS', command)
	}
}
