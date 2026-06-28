import { IEvent } from '@nestjs/cqrs'

export class ExchangeMoSuccessEvent implements IEvent {
	constructor(
		public readonly exchangeSkus: string[],
		public readonly source: Array<{ mo_no: string; factory_shoes_style: string; color_sn: string }>,
		public readonly target: { mo_no: string; factory_shoes_style: string; color_sn: string }
	) {}
}
