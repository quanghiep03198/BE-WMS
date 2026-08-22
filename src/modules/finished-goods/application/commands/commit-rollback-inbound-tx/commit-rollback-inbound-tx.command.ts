import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { Command } from '@nestjs/cqrs'

export class CommitRollbackInboundTxCommand extends Command<void> {
	constructor(public readonly rolledBackEpcs: Array<{ epc: string; status: FinishedGoodsEpcStatus }>) {
		super()
	}
}
