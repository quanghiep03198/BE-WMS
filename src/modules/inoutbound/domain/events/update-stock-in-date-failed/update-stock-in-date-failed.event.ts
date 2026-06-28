import { IEvent } from '@nestjs/cqrs'
import { ElectronicProductCode } from '../../value-objects/epc.vo'

export class UpdateStockInDateFailedEvent implements IEvent {
	constructor(
		public readonly stationNo: 'WH101' | 'WH103',
		public readonly scannedEpcs: Array<ElectronicProductCode>
	) {}
}
