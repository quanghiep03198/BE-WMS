import { IEvent } from '@nestjs/cqrs'

export class UpdateStockInTimestampSuccessEvent implements IEvent {
	constructor(public readonly yearMonth: { year: number; month: number }) {}
}
