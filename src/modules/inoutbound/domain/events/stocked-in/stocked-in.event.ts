import { IEvent } from '@nestjs/cqrs'
import { ElectronicProductCode } from '../../entities/epc.entity'

export class StockedInEvent implements IEvent {
	constructor(public readonly scannedEpcs: Array<ElectronicProductCode>) {}
}
