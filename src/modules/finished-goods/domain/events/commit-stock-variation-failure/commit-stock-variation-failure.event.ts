import { IEvent } from '@nestjs/cqrs'
import { StockFlow } from '../../types'
import { ElectronicProductCode } from '../../value-objects/epc.vo'

/**
 * @deprecated
 */
export class CommitStockVariationFailureEvent implements IEvent {
	constructor(
		public readonly stockFlow: StockFlow,
		public readonly scannedEpcs: Array<ElectronicProductCode>
	) {}
}
