import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { Command } from '@nestjs/cqrs'

export class CommitStockOutCommand extends Command<void> {
	constructor(public readonly pendingStockOutEpcs: Array<ElectronicProductCode>) {
		super()
	}
}
