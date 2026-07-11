import { IEvent } from '@nestjs/cqrs'

export class ExchangeMoSuccessEvent implements IEvent {
	constructor(
		public readonly exchangeSkus: string[],
		public readonly targetMo: string
	) {}
}
