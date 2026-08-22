import { IEvent } from '@nestjs/cqrs'

export class ExchangedManufacturingOrderEvent implements IEvent {
	constructor(
		public readonly exchangeSkus: string[],
		public readonly targetMo: string
	) {}
}
