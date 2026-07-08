import { AggregateRoot } from '@nestjs/cqrs'
import {
	MismatchingMoSpecsException,
	MismatchingSizeNumberException,
	NoExchangableEpcException
} from '../exceptions/mo-exchange-tx.exception'
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

	public validate() {
		const pendingExchangeSkus = this.getPendingExchangeSkus()

		if (pendingExchangeSkus.length === 0) throw new NoExchangableEpcException()

		const isMoSpecsMatching = this.sourceMos.some((sourceMo) => {
			return (
				sourceMo.factory_shoes_style !== this.targetMo.factory_shoes_style ||
				sourceMo.color_sn !== this.targetMo.color_sn
			)
		})
		if (!isMoSpecsMatching) {
			throw new MismatchingMoSpecsException()
		}

		const isSizeNumberMatching = this.sourceMos.every((sourceMo) => {
			return sourceMo.sizes.every((sourceSize) => {
				return this.targetMo.sizes.some((targetSize) => sourceSize.isEqual(targetSize))
			})
		})

		if (!isSizeNumberMatching) {
			throw new MismatchingSizeNumberException()
		}

		return pendingExchangeSkus
	}

	protected getTargetMo(): string {
		return this.targetMo.mo_no
	}

	protected standardizeSizeNumber(size: string): string {
		return Number.parseFloat(size).toString()
	}

	protected getPendingExchangeSkus(): string[] {
		return this.sourceMos.flatMap((mo) => mo.epcs)
	}
}
