import { TManufacturingOrder } from '@modules/order/types'
import { AggregateRoot } from '@nestjs/cqrs'
import { format } from 'date-fns'
import { FALLBACK_VALUE } from '../constants'
import { UpsertedEpcsMatchEvent } from '../events/upserted-epcs-match/upserted-epcs-match.event'
import {
	MismatchingMoSpecsException,
	MismatchingSizeNumberException,
	NoExchangableEpcException,
	NoExchangableMoException
} from '../exceptions/mo-exchange-tx.exception'
import { UpsertEpcsMatchData } from '../types'
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
		public readonly targetMo: TManufacturingOrder,
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

		const targetShoeStyle = this.getTargetFactoryShoeStyle()
		const targetColor = this.getTargetColor()
		const targetSizes = this.getTargetSizes()

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

		this.apply(new UpsertedEpcsMatchEvent(this.toDataArray.apply(this)))

		return { getPayload: this.toDataArray.bind(this) }
	}

	private toDataArray(): UpsertEpcsMatchData {
		const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss')

		console.log('pendingExchangeEpcs', this.pendingExchangeEpcs)

		if (!Array.isArray(this.pendingExchangeEpcs)) return []

		return this.pendingExchangeEpcs.map((item) => ({
			epc: item.epc,
			mo_no: this.getTargetMo(),
			factory_shoes_style: this.getTargetFactoryShoeStyle(),
			color_sn: this.getTargetColor(),
			factory_code_produce: this.getFactoryProduce(),
			size_numcode: this.getTargetSizeNumber(),
			brand_name: this.getTargetBrandName(),
			mat_code: this.getTargetMatCode(),
			size_sumqty: this.getTargetSizeSumQty(),
			size_qty: this.getSizeQty(),
			mo_noseq: this.getTargetMoSeq(),
			or_no: this.getTargetOrNo(),
			cust_shoes_style: this.getTargetCustomerShoeStyle(),
			size_code: this.getTargetSizeCode(),
			or_cust_po: this.getTargetOrCustPo(),
			remark:
				item.mo_no === FALLBACK_VALUE
					? `[${timestamp}] Info: Combined from WMS`
					: `[${timestamp}] Info: Exchanged from MO ${item.mo_no}`
		}))
	}

	private getPendingUpsertEpcs() {
		return this.pendingExchangeEpcs.map((item) => item.epc)
	}

	private getTargetMo() {
		return this.targetMo?.mo_no
	}

	private getTargetFactoryShoeStyle() {
		const value = this.targetMo?.factory_shoes_style

		if (typeof value !== 'string' || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingMoSpecsException()

		return value
	}

	private getTargetCustomerShoeStyle() {
		const value = this.targetMo?.cust_shoes_style

		if (typeof value !== 'string' || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingMoSpecsException()

		return value
	}

	private getTargetColor() {
		const value = this.targetMo?.color_sn

		if (typeof value !== 'string' || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingMoSpecsException()

		return value
	}

	private getTargetSizeNumber() {
		return this.targetSizeNumber
	}

	private getTargetSizes() {
		const value = this.targetMo?.sizes

		if (!Array.isArray(value) || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingSizeNumberException()

		return value.map((size) => new SizeNumber(size.size_numcode))
	}

	private getFactoryProduce() {
		const value = this.targetMo?.factory_code_produce

		if (typeof value !== 'string' || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingMoSpecsException()

		return value
	}

	private getTargetBrandName() {
		const value = this.targetMo?.brand_name

		if (typeof value !== 'string' || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingMoSpecsException()

		return value
	}

	private getTargetMatCode() {
		const value = this.targetMo?.mat_code

		if (typeof value !== 'string' || typeof value === 'undefined' || (typeof value === 'object' && value === null))
			throw new MismatchingMoSpecsException()

		return value
	}

	private getTargetSizeSumQty() {
		return this.targetMo?.size_sumqty ?? 1
	}

	private getTargetSizeCode() {
		return this.targetMo?.size_code ?? ''
	}

	private getTargetMoSeq() {
		return this.targetMo?.mo_noseq ?? '001'
	}

	private getTargetOrNo() {
		return this.targetMo?.or_no ?? ''
	}

	private getTargetOrCustPo() {
		return this.targetMo?.or_cust_po ?? ''
	}

	private getSizeQty() {
		return (
			this.targetMo.sizes.find(({ size_numcode }) =>
				new SizeNumber(size_numcode).isEqual(new SizeNumber(this.targetSizeNumber))
			)?.size_qty ?? 1
		)
	}
}
