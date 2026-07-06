import { AggregateRoot } from '@nestjs/cqrs'
import { SizeNumber } from '../value-objects/size-number.vo'

export type UpsertEpcInformationPayload = Array<{
	epc: string
	mo_no: string
	factory_shoes_style: string
	color_sn: string
	size_numcode: string
	factory_code_orders: string
	factory_name_orders: string
	factory_code_produce: string
	factory_name_produce: string
	remark: string
	quantity?: number
	mo_no_actual?: string
	or_no?: string
	or_cust_po?: string
	mo_noseq?: string
	size_code?: string
	size_qty?: number
	mat_code?: string
	cust_shoes_style?: string
	color_sn_actual?: string
	factory_shoes_style_actual?: string
	size_numcode_actual?: string
}>

export class UpsertEpcInformationTx extends AggregateRoot {
	constructor(
		public readonly payload: UpsertEpcInformationPayload,
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
		return this.payload.every((item) => {
			const isSameSize = this.targetMo.sizes.some((size) =>
				new SizeNumber(size).isEqual(new SizeNumber(item.size_numcode))
			)
			const isSameShoeStyle = this.targetMo.factory_shoes_style === item.factory_shoes_style
			const isSameColor = this.targetMo.color_sn === item.color_sn

			return isSameSize && isSameShoeStyle && isSameColor
		})
	}
}
