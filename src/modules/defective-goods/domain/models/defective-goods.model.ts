import { EPCGenerator } from '@modules/defective-goods/application/helpers/epc-generator'
import { AggregateRoot } from '@nestjs/cqrs'
import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '../constants'
import { DefectiveGoodsChangedEvent } from '../events/defective-goods.events'
import { NotStockedInYetException, StockInDeactivatedException } from '../exceptions'
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
		if (!this.state._id) throw new Error('Attempted to stock in a defective goods model without an ID')
		return this.state._id.toString()
	}

	get epc() {
		return this.state.epc
	}

	toProps() {
		return this.state
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

		const unit =
			payload.defective_category === DefectiveCategory.C_GRADE ? DefectiveGoodsUnit.PCS : DefectiveGoodsUnit.PRS
		if (payload.combination_strategy !== CombinationStrategy.MANUALLY) delete payload.sizes

		if (
			payload.combination_strategy === CombinationStrategy.UHF &&
			Array.isArray(payload.epc) &&
			typeof payload.size_numcode === 'string'
		) {
			models = payload.epc.map(
				(epc) => new DefectiveGoodsDomainModel({ ...payload, epc, size_numcode: payload.size_numcode, unit })
			)
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
			return models
		}
		return models
	}

	insert() {
		this.apply(new DefectiveGoodsChangedEvent(this.id))
	}

	update(update: Partial<IDefectiveGoodsProps>, updatedBy: TObjectId) {
		Object.assign(this.state, { ...update, updated_by: updatedBy })
		this.apply(new DefectiveGoodsChangedEvent(this.id))
	}

	stockIn(storageLocation: string, updatedBy: TObjectId) {
		if (this.state.deleted) throw new StockInDeactivatedException()

		this.state.inbound_date = new Date()
		this.state.storage_location = storageLocation
		this.state.updated_by = updatedBy
		this.apply(new DefectiveGoodsChangedEvent(this.id))
	}

	stockOut(
		outboundPurpose: DefectiveGoodsOutboundPurpose,
		updatedBy: TObjectId,
		po: string = undefined,
		outboundDate: Date = new Date()
	) {
		if (!this.state.inbound_date || !this.state.storage_location) throw new NotStockedInYetException()
		const shouldDowngrade =
			outboundPurpose === DefectiveGoodsOutboundPurpose.RUIN ||
			outboundPurpose === DefectiveGoodsOutboundPurpose.DOWNGRADE
		const shouldShipOut = outboundPurpose === DefectiveGoodsOutboundPurpose.SHIPPING

		const shouldDeactivate = outboundPurpose !== DefectiveGoodsOutboundPurpose.DOWNGRADE

		this.state.updated_by = updatedBy
		this.state.po = shouldShipOut ? po : this.state.po
		this.state.defective_category = shouldDowngrade ? DefectiveCategory.C_GRADE : this.state.defective_category
		this.state.outbound_date = shouldDeactivate ? outboundDate : this.state.outbound_date

		this.apply(new DefectiveGoodsChangedEvent(this.id))
	}

	delete(deletedBy: TObjectId) {
		if (!this.id) throw new Error('Attempted to insert a defective goods model without an ID')
		this.state.updated_by = deletedBy
		this.state.deleted_by = deletedBy
		this.apply(new DefectiveGoodsChangedEvent(this.id))
	}
}
