import { AggregateRoot } from '@nestjs/cqrs'
import { ExchangeMoSuccessEvent } from '../events/exchange-mo-success/exchange-mo-success.event'
import { InvalidSourceMoException, NoExchangableEpcException } from '../exceptions/mo-exchange-session.exception'

export class MoExchangeSession extends AggregateRoot {
	constructor(
		private readonly sourceMos: Array<{
			mo_no: string
			factory_shoes_style: string
			color_sn: string
			mo_size_run: Record<'size_numcode', string>[]
		}>,
		private readonly targetMo: {
			mo_no: string
			factory_shoes_style: string
			color_sn: string
			mo_size_run: Record<'size_numcode', string>[]
		}
	) {
		super()
	}

	public verify(pendingExchangeSkus) {
		if (pendingExchangeSkus.length === 0) throw new NoExchangableEpcException()

		if (this.sourceMos.includes(this.targetMo)) throw new InvalidSourceMoException()

		if (
			this.sourceMos.some(
				(sourceMo) =>
					sourceMo.factory_shoes_style !== this.targetMo.factory_shoes_style ||
					sourceMo.color_sn !== this.targetMo.color_sn
			)
		) {
			throw new InvalidSourceMoException()
		}

		// TODO: Check if all of size in target MO includes sizes in source MOs

		this.apply(new ExchangeMoSuccessEvent(pendingExchangeSkus, this.sourceMos, this.targetMo))
	}
}
