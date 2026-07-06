import { StockMovementDirection } from '@/modules/inoutbound/domain/types'
import { Command } from '@nestjs/cqrs'

export class DeleteScanningMoCommand extends Command<void> {
	constructor(
		public readonly stockMovementDirection: StockMovementDirection,
		public readonly manufacturingOrder: string,
		public readonly rescannable: boolean,
		public readonly deviceSerialNumber?: string
	) {
		super()
	}
}
