import { IEvent } from '@nestjs/cqrs'
import { ElectronicProductCode } from '../../value-objects/epc.vo'

export class RecalledFromStockEvent implements IEvent {
	constructor(public readonly recalledEpcs: Array<ElectronicProductCode>) {}
}
