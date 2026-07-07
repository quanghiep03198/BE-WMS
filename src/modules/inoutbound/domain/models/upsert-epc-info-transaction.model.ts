import { AggregateRoot } from '@nestjs/cqrs'
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

	public verify() {
		return this.pendingExchangeEpcs.every((item) => {
			const isSameSize = this.targetMo.sizes.some((size) =>
				new SizeNumber(size).isEqual(new SizeNumber(item.size_numcode))
			)
			const isSameShoeStyle = this.targetMo.factory_shoes_style === item.factory_shoes_style
			const isSameColor = this.targetMo.color_sn === item.color_sn

			return isSameSize && isSameShoeStyle && isSameColor
		})
	}

	public getPendingExchangeEpcs() {
		return this.pendingExchangeEpcs.map((item) => item.epc)
	}

	public getTargetMo() {
		return this.targetMo.mo_no
	}
}
