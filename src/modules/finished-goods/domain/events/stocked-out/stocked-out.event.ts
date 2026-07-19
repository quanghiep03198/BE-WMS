import { IEvent } from '@nestjs/cqrs'
import { ElectronicProductCode } from '../../value-objects/epc.vo'

export class StockedOutEvent implements IEvent {
	constructor(
		public readonly transactionId: string,
		public readonly scannedEpcs: Array<ElectronicProductCode>
	) {}
}
