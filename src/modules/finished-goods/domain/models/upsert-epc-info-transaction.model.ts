import { AggregateRoot } from '@nestjs/cqrs'
import {
	MismatchingMoSpecsException,
	MismatchingSizeNumberException,
	NoExchangableEpcException,
	NoExchangableMoException
} from '../exceptions/mo-exchange-tx.exception'
import { SizeNumber } from '../value-objects/size-number.vo'

export type UpsertEpcInformationPayload = Array<{
	epc: string
	mo_no: string
	factory_shoes_style: string
	color_sn: string
	size_numcode: string
	// factory_code_orders: string
	// factory_name_orders: string
	// factory_code_produce: string
	// factory_name_produce: string
	// remark: string
}>

export class UpsertEpcInfoTransaction extends AggregateRoot {
	constructor(
		public readonly pendingExchangeEpcs: UpsertEpcInformationPayload,
		public readonly targetMo: {
			sizes: Array<string>
			mo_no: string
			factory_shoes_style: string
			color_sn: string
		}
	) {
		super()
	}

	public validate() {
		let isShoeStyleConsistent: boolean = true
		let isColorConsistent: boolean = true
		let isSizeNumberConsistent: boolean = true

		if (!this.targetMo) throw new NoExchangableMoException()

		if (this.pendingExchangeEpcs.length === 0) throw new NoExchangableEpcException()

		const targetShoeStyle = this.getTargetShoeStyle()
		const targetColor = this.getTargetColor()
		const targetSizes = this.getTargetSizes()

		this.pendingExchangeEpcs.forEach((item) => {
			isShoeStyleConsistent = targetShoeStyle === item.factory_shoes_style
			isColorConsistent = targetColor === item.color_sn
			isSizeNumberConsistent = targetSizes.some((targetSize) =>
				targetSize.isEqual(new SizeNumber(item.size_numcode))
			)
		})

		if (!isShoeStyleConsistent || !isColorConsistent) throw new MismatchingMoSpecsException()
		if (!isSizeNumberConsistent) throw new MismatchingSizeNumberException()

		return {
			exchangableEpcs: this.getPendingExchangeEpcs(),
			targetMo: this.getTargetMo()
		}
	}

	public getPendingExchangeEpcs() {
		return this.pendingExchangeEpcs.map((item) => item.epc)
	}

	public getTargetMo() {
		return this.targetMo?.mo_no
	}

	public getTargetShoeStyle() {
		const value = this.targetMo?.factory_shoes_style

		if (typeof value !== 'string' || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingMoSpecsException()

		return value
	}

	public getTargetColor() {
		const value = this.targetMo?.color_sn

		if (typeof value !== 'string' || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingMoSpecsException()

		return value
	}

	public getTargetSizes() {
		const value = this.targetMo?.sizes

		if (!Array.isArray(value) || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingSizeNumberException()

		return value.map((size) => new SizeNumber(size))
	}
}
