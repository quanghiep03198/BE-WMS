import { IEvent } from '@nestjs/cqrs'

export class CheckedOutInventoryEvent implements IEvent {
	constructor(public readonly month: string) {}
}
