import { IEvent } from '@nestjs/cqrs'
import { ElectronicProductCode } from '../../value-objects/epc.vo'

export class StockedInEvent implements IEvent {
	constructor(public readonly stockedInEpcs: Array<ElectronicProductCode>) {}
}
