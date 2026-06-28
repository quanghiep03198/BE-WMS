import { AggregateRoot } from '@nestjs/cqrs'
import { ExchangeMoSuccessEvent } from '../events/exchange-mo-success/exchange-mo-success.event'
import { InvalidSourceMoException, NoExchangableEpcException } from '../exceptions/mo-exchange-session.exception'

export class MoExchangeSession extends AggregateRoot {
	constructor(
		private readonly source: Array<{ mo_no: string; factory_shoes_style: string; color_sn: string }>,
		private readonly target: { mo_no: string; factory_shoes_style: string; color_sn: string }
	) {
		super()
	}

	public verify(exchangeSkus: Array<string>) {
		if (exchangeSkus.length === 0) throw new NoExchangableEpcException()

		if (this.source.includes(this.target)) throw new InvalidSourceMoException()

		if (
			this.source.some(
				(sourceMo) =>
					sourceMo.factory_shoes_style !== this.target.factory_shoes_style ||
					sourceMo.color_sn !== this.target.color_sn
			)
		) {
			throw new InvalidSourceMoException()
		}

		this.apply(new ExchangeMoSuccessEvent(exchangeSkus, this.source, this.target))
	}
}
