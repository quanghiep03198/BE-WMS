import { StockMovementDirection } from '@/modules/inoutbound/domain/types'
import { Query } from '@nestjs/cqrs'

export class GetScanningEpcsBySizeQuery extends Query<Record<'epc', string>[]> {
	constructor(
		public readonly stockMovementDirection: StockMovementDirection,
		public readonly manufacturingOrder: string,
		public readonly sizeNumber: string,
		public readonly inboundDeviceSerialNumber?: string
	) {
		super()
	}
}
