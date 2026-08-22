import { IEvent } from '@nestjs/cqrs'
import { FinishedGoodsEpcStatus } from './../../constants/index'

export class RolledBackInboundTxEvent implements IEvent {
	constructor(public readonly rolledBackEpcs: Array<{ epc: string; status: FinishedGoodsEpcStatus }>) {}
}
