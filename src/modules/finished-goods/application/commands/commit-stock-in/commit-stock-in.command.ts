import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { Command } from '@nestjs/cqrs'

export class CommitStockInCommand extends Command<void> {
	constructor(public readonly pendingInboundEpcs: Array<ElectronicProductCode>) {
		super()
	}
}
