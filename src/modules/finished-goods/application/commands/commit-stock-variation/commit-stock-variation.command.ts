import { StockFlow } from '@modules/finished-goods/domain/types'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { Command } from '@nestjs/cqrs'

export class CommitStockVariationCommand extends Command<void> {
	constructor(
		public readonly pendingInboundEpcs: Array<ElectronicProductCode>,
		public readonly stockFlow: StockFlow
	) {
		super()
	}
}
