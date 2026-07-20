import { IEvent } from '@nestjs/cqrs'

export class CommitedStockIn implements IEvent {
	constructor(public readonly commitedStockInQty: number) {}
}
