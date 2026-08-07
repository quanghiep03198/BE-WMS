import { IEvent } from '@nestjs/cqrs'

/**
 * @deprecated
 */
export class CommitStockOutFailureEvent implements IEvent {
	constructor() {}
}
