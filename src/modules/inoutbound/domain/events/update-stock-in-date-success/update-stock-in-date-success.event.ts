import { IEvent } from '@nestjs/cqrs'

export class UpdateStockInDateSuccessEvent implements IEvent {
	constructor(public readonly yearMonth: { year: number; month: number }) {}
}
