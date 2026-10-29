import { EPCGenerator } from '@modules/defective-goods/application/helpers/epc-generator'
import { AggregateRoot } from '@nestjs/cqrs'
import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '../constants'
import { DefectiveGoodsDeletedEvent } from '../events/defective-goods.events'
import { IDefectiveGoods } from '../interfaces'

export interface IDefectiveGoodsProps extends Omit<IDefectiveGoods, 'assembly_line' | 'sewing_line'> {
	assembly_line?: string
	sewing_line?: string
}

export class DefectiveGoodsModel extends AggregateRoot {
	constructor(private readonly state: IDefectiveGoodsProps) {
		super()
	}

	get id() {
		return this.state._id
	}

	static create(payload: {
		combination_strategy?: CombinationStrategy
		defective_category?: DefectiveCategory
		po: string
		mo_no?: string
		brand_name?: string
		cust_shoes_style?: string
		factory_shoes_style?: string
		color_sn?: string
		size_numcode?: string
		defective_location?: DefectiveLocation
		defective_description?: string
		shoe_source?: DefectiveGoodsSource
		sewing_line?: string
		assembly_line?: string
		epc?: string | string[]
		sizes?: {
			size_numcode: string
			qty: number
		}[]
		created_by: TObjectId
	}): IDefectiveGoodsProps[] {
		const unit = DefectiveGoodsModel.detectUnit(payload.defective_category)

		if (payload.combination_strategy !== CombinationStrategy.MANUALLY) delete payload.sizes

		if (payload.combination_strategy === 'uhf' && Array.isArray(payload.epc)) {
			return payload.epc.map((item) => ({ epc: item, unit, ...payload }) as IDefectiveGoodsProps)
		}
		if (payload.combination_strategy === 'usb' && typeof payload.epc === 'string') {
			return [{ ...payload, unit } as IDefectiveGoodsProps]
		}
		if (payload.combination_strategy === 'manually' && Array.isArray(payload.sizes)) {
			delete payload.epc
			const generator = new EPCGenerator()
			return payload.sizes.flatMap(({ size_numcode, qty }) => {
				const epcs = generator.generateBatch(qty)
				return epcs.map((epc) => ({ epc, size_numcode, unit, ...payload }) as IDefectiveGoodsProps)
			})
		}
	}

	stockIn() {}

	delete(ids: string[], deletedBy: string) {
		this.apply(new DefectiveGoodsDeletedEvent(ids, deletedBy))
	}

	private static detectUnit(category: DefectiveCategory) {
		return category === DefectiveCategory.C_GRADE ? DefectiveGoodsUnit.PCS : DefectiveGoodsUnit.PRS
	}
}
