import { AggregateRoot } from '@nestjs/cqrs'
import { FALLBACK_VALUE } from '../constants'
import { ExchangeMoSuccessEvent } from '../events/exchange-mo-success/exchange-mo-success.event'
import {
	MismatchingMoSpecsException,
	MismatchingSizeNumberException,
	NoExchangableEpcException,
	NoExchangableMoException
} from '../exceptions/mo-exchange-tx.exception'
import { UpsertEpcsMatchPayload } from '../types'
import { SizeNumber } from '../value-objects/size-number.vo'

export type UpsertEpcInformationPayload = Array<{
	epc: string
	mo_no: string
	factory_shoes_style: string
	color_sn: string
	size_numcode: string
}>

export class UpsertEpcsMatchTransaction extends AggregateRoot {
	constructor(
		public readonly pendingExchangeEpcs: UpsertEpcInformationPayload,
		public readonly targetMo: UpsertEpcsMatchPayload & {
			sizes: Array<string>
		},
		public readonly targetSizeNumber: string
	) {
		super()
	}

	public startTransaction() {
		let isShoeStyleConsistent: boolean = true
		let isColorConsistent: boolean = true
		let isSizeNumberConsistent: boolean = true

		if (!this.targetMo) throw new NoExchangableMoException()

		if (this.pendingExchangeEpcs.length === 0) throw new NoExchangableEpcException()

		const targetMo = this.getTargetMo()
		const targetShoeStyle = this.getTargetShoeStyle()
		const targetColor = this.getTargetColor()
		const targetSizes = this.getTargetSizes()
		const targetFactoryProduce = this.getFactoryProduce()
		const targetSizeNumber = this.getTargetSizeNumber()

		// if(new SizeNumber(this.targetSizeNumber).isEqual())
		isSizeNumberConsistent = targetSizes.some((targetSize) =>
			targetSize.isEqual(new SizeNumber(this.targetSizeNumber))
		)

		this.pendingExchangeEpcs.forEach((item) => {
			isShoeStyleConsistent =
				item.factory_shoes_style === FALLBACK_VALUE || targetShoeStyle === item.factory_shoes_style
			isColorConsistent = item.color_sn === FALLBACK_VALUE || targetColor === item.color_sn
			isSizeNumberConsistent = targetSizes.some((targetSize) => {
				return item.size_numcode === FALLBACK_VALUE || targetSize.isEqual(new SizeNumber(item.size_numcode))
			})
		})

		if (!isShoeStyleConsistent || !isColorConsistent) throw new MismatchingMoSpecsException()
		if (!isSizeNumberConsistent) throw new MismatchingSizeNumberException()

		this.apply(new ExchangeMoSuccessEvent(this.getPendingExchangeEpcs(), this.getTargetMo()))

		return {
			toDataArray: (): UpsertEpcsMatchPayload => {
				return this.pendingExchangeEpcs.map((item) => ({
					epc: item.epc,
					mo_no: targetMo,
					factory_shoes_style: targetShoeStyle,
					color_sn: targetColor,
					factory_code_produce: targetFactoryProduce,
					size_numcode: targetSizeNumber,
					brand_name: targetBrandName,
					mat_code
				}))
			}
		}
	}

	// public toDataArray() {
	// 	return this.pendingExchangeEpcs.map((item) => ({
	// 		epc: item.epc,
	// 		mo_no: this.getTargetMo(),
	// 		factory_shoes_style: this.getTargetShoeStyle(),
	// 		color_sn: this.getTargetColor(),
	// 		size_numcode: this.targetSizeNumber
	// 	}))
	// }

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

	public getTargetSizeNumber() {
		return this.targetSizeNumber
	}

	public getTargetSizes() {
		const value = this.targetMo?.sizes

		if (!Array.isArray(value) || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingSizeNumberException()

		return value.map((size) => new SizeNumber(size))
	}

	public getFactoryProduce() {
		const value = this.targetMo?.factory_code_produce

		if (typeof value !== 'string' || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingMoSpecsException()
	}
}
