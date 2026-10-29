import { EPCGenerator } from '@modules/defective-goods/application/helpers/epc-generator'
import { AggregateRoot } from '@nestjs/cqrs'
import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '../constants'
import { DefectiveGoodsChangedEvent, DefectiveGoodsCreatedEvent } from '../events/defective-goods.events'
import { IDefectiveGoods } from '../interfaces'

export interface IDefectiveGoodsProps extends Omit<IDefectiveGoods, 'assembly_line' | 'sewing_line'> {
	assembly_line?: string
	sewing_line?: string
}

export class DefectiveGoodsDomainModel extends AggregateRoot {
	constructor(private readonly state: IDefectiveGoodsProps) {
		super()
	}

	get id() {
		return this.state._id.toString()
	}

	static create(payload: {
		combination_strategy: CombinationStrategy
		defective_category: DefectiveCategory
		po?: Nullish<string>
		mo_no?: Nullish<string>
		brand_name: string
		cust_shoes_style: string
		factory_shoes_style: string
		color_sn: string
		size_numcode?: string
		defective_location: DefectiveLocation
		defective_description: string
		shoe_source: DefectiveGoodsSource
		sewing_line?: string
		assembly_line?: string
		epc?: string | string[]
		sizes?: {
			size_numcode: string
			qty: number
		}[]
		created_by: TObjectId
	}): Array<DefectiveGoodsDomainModel> {
		let models: DefectiveGoodsDomainModel[] = []

		const unit = DefectiveGoodsDomainModel.detectUnit(payload.defective_category)

		if (payload.combination_strategy !== CombinationStrategy.MANUALLY) delete payload.sizes

		if (
			payload.combination_strategy === CombinationStrategy.UHF &&
			Array.isArray(payload.epc) &&
			typeof payload.size_numcode === 'string'
		) {
			models = payload.epc.map(
				(epc) => new DefectiveGoodsDomainModel({ ...payload, epc, size_numcode: payload.size_numcode, unit })
			)
			// models.forEach((model) => model.apply(new DefectiveGoodsChangedEvent(model.id)))
			return models
		}
		if (
			payload.combination_strategy === CombinationStrategy.USB &&
			typeof payload.epc === 'string' &&
			typeof payload.size_numcode === 'string'
		) {
			const model = new DefectiveGoodsDomainModel({
				...payload,
				epc: payload.epc,
				size_numcode: payload.size_numcode,
				unit
			})
			// model.apply(new DefectiveGoodsCreatedEvent(model.id))
			models.push(model)
			return models
		}
		if (payload.combination_strategy === 'manually' && Array.isArray(payload.sizes)) {
			delete payload.epc
			const generator = new EPCGenerator()
			models = payload.sizes.flatMap(({ size_numcode, qty }) => {
				const epcs = generator.generateBatch(qty)
				return epcs.map((epc) => new DefectiveGoodsDomainModel({ ...payload, epc, size_numcode, unit }))
			})
			// models.forEach((model) => model.apply(new DefectiveGoodsCreatedEvent(model.id)))
			return models
		}
		return models
	}

	toProps() {
		return this.state
	}

	create() {
		this.apply(new DefectiveGoodsCreatedEvent(this.id))
	}

	stockIn() {}

	delete(deletedBy: string) {
		this.apply(new DefectiveGoodsChangedEvent(this.id, { updatedBy: deletedBy }))
	}

	private static detectUnit(category: DefectiveCategory): DefectiveGoodsUnit {
		return category === DefectiveCategory.C_GRADE ? DefectiveGoodsUnit.PCS : DefectiveGoodsUnit.PRS
	}
}
