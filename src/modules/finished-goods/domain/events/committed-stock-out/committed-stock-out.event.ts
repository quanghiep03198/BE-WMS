import { IEvent } from '@nestjs/cqrs'

export class CommittedStockOutEvent implements IEvent {
	constructor(public readonly commitedStockOutQty: number) {}
}
