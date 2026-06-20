import { IEvent } from '@nestjs/cqrs'
import { ElectronicProductCode } from '../../entities/epc.entity'

export class UpdateStockInDateFailedEvent implements IEvent {
	constructor(public readonly scannedEpcs: Array<ElectronicProductCode>) {}
}
