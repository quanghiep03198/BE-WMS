import { StockFlow } from '@modules/inoutbound/domain/types'
import { Query } from '@nestjs/cqrs'

export class GetScanningEpcsBySizeQuery extends Query<Record<'epc', string>[]> {
	constructor(
		public readonly stockFlow: StockFlow,
		public readonly manufacturingOrder: string,
		public readonly sizeNumber: string,
		public readonly inboundDeviceSerialNumber?: string,
		public readonly limit?: number
	) {
		super()
	}
}
