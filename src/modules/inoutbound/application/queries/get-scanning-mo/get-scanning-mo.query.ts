import { StockFlow } from '@/modules/inoutbound/domain/types'
import { IQuery } from '@nestjs/cqrs'

export class GetScanningMosQuery implements IQuery {
	constructor(
		public readonly stockFlow: StockFlow,
		public readonly deviceSerialNumber?: string
	) {}
}
