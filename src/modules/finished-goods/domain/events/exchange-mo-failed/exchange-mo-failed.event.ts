import { IEvent } from '@nestjs/cqrs'

export class ExchangeMoFailedEvent implements IEvent {
	constructor(
		public readonly exchangeSkus: string[],
		public readonly targetMo: string
	) {}
}
