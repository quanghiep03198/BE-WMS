import { IEvent } from '@nestjs/cqrs'

export class RollbackMssqlInboundDataEvent implements IEvent {
	constructor() {}
}
