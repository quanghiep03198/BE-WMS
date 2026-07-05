import { AggregateRoot } from '@nestjs/cqrs'
import { ExchangeMoSuccessEvent } from '../events/exchange-mo-success/exchange-mo-success.event'
import {
	InconsistentMoSizesException,
	InconsistentMoSpecsException,
	NoExchangableEpcException
} from '../exceptions/mo-exchange-session.exception'
import { SizeNumber } from '../value-objects/size-number.vo'

export class MoExchangeTransaction extends AggregateRoot {
	constructor(
		private readonly sourceMos: Array<{
			epcs: Array<string>
			mo_no: string
			factory_shoes_style: string
			color_sn: string
			sizes: Array<SizeNumber>
		}>,
		private readonly targetMo: {
			mo_no: string
			factory_shoes_style: string
			color_sn: string
			sizes: Array<SizeNumber>
		}
	) {
		super()
	}

	public verify(): void {
		const pendingExchangeSkus = this.getPendingExchangeSkus()
		const targetMo = this.getTargetMo()

		if (pendingExchangeSkus.length === 0) throw new NoExchangableEpcException()

		if (
			this.sourceMos.some(
				(sourceMo) =>
					sourceMo.factory_shoes_style !== this.targetMo.factory_shoes_style ||
					sourceMo.color_sn !== this.targetMo.color_sn
			)
		) {
			throw new InconsistentMoSpecsException()
		}

		const isSizeConsistent = this.sourceMos.every((sourceMo) => {
			return sourceMo.sizes.every((sourceSize) => {
				return this.targetMo.sizes.some((targetSize) => sourceSize.isEqual(targetSize))
			})
		})

		if (!isSizeConsistent) {
			throw new InconsistentMoSizesException()
		}

		this.apply(new ExchangeMoSuccessEvent(pendingExchangeSkus, targetMo))
	}

	public getTargetMo(): string {
		return this.targetMo.mo_no
	}

	public standardizeSizeNumber(size: string): string {
		return Number.parseFloat(size).toString()
	}

	public getPendingExchangeSkus(): string[] {
		return this.sourceMos.flatMap((mo) => mo.epcs)
	}
}
