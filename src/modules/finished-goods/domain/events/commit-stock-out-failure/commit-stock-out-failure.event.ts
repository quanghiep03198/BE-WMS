import { IEvent } from '@nestjs/cqrs'

export class CommitStockOutFailureEvent implements IEvent {
	constructor() {}
}
