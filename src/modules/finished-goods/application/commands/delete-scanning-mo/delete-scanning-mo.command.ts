import { StockFlow } from '@modules/finished-goods/domain/types'
import { Command } from '@nestjs/cqrs'

export class DeleteScanningMoCommand extends Command<void> {
	constructor(
		public readonly stockFlow: StockFlow,
		public readonly manufacturingOrder: string,
		public readonly rescannable: boolean,
		public readonly deviceSerialNumber?: string
	) {
		super()
	}
}
