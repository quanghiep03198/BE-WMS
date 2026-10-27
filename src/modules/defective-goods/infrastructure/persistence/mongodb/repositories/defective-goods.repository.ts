import { TRequestUser } from '@common/decorators'
import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { BaseMongoRepository } from '@modules/_base/repositories/base-mongo.abstract.repository'
import {
	UpdateInboundStatusDTO,
	UpdateOutboundStatusDTO
} from '@modules/defective-goods/application/dto/inoutbound.dto'
import { IDefectiveGoodsRepository } from '@modules/defective-goods/application/ports/defective-goods.repository.port'
import { DefectiveCategory, DefectiveGoodsOutboundPurpose } from '@modules/defective-goods/domain/constants'
import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { LeanDocument, mongo, Types, type AnyBulkWriteOperation } from 'mongoose'
import { DefectiveGoods, DefectiveGoodsDocument, DefectiveGoodsModel } from '../schemas/defective-goods.schema'

@Injectable()
export class DefectiveGoodsMongoRepository
	extends BaseMongoRepository<DefectiveGoodsDocument>
	implements IDefectiveGoodsRepository
{
	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION)
		private readonly defectiveGoodsModel: DefectiveGoodsModel
	) {
		super(defectiveGoodsModel)
	}

	override async findAll(filter?: Partial<IDefectiveGoods>) {
		return await super.findAll(filter ?? {}, undefined, {
			readPreference: 'primary' satisfies mongo.ReadPreferenceMode,
			lean: { virtuals: true, autopopulate: true }
		})
	}

	async getInoutboundEpcs(stockFlow: 'inbound' | 'outbound', filter?: Partial<IDefectiveGoods>, take?: number) {
		const filterQueries = MongoQueryBuilder.from({ ...filter, combination_strategy: 'manually' })
			.whereEqual('combination_strategy')
			.whereEqual('unit')
			.whereEqual('defective_category')
			.whereLike('epc')
			.whereLike('brand_name')
			.whereLike('factory_shoes_style')
			.whereLike('po')
			.whereLike('mo_no')
			.whereLike('color_sn')
			.whereLike('size_numcode')
			.when(stockFlow === 'inbound', (qb) => qb.whereFieldsAreNull('inbound_date', 'storage_location'))
			.when(stockFlow === 'outbound', (qb) =>
				qb.whereFieldsAreNotNull('inbound_date', 'storage_location').whereFieldsAreNull('outbound_date')
			)
			.build()

		console.log('filter', filter)
		console.log('filterQueries', filterQueries)

		return await this.defectiveGoodsModel
			.find(filterQueries)
			.lean({ virtuals: true, autopopulate: true })
			.read('primary' satisfies mongo.ReadPreferenceMode)
			.limit(take)
	}

	async stockIn(payload: UpdateInboundStatusDTO, user: TRequestUser) {
		const inboundDate = new Date()
		await this.defectiveGoodsModel.bulkWrite(
			payload.epcs.map<AnyBulkWriteOperation<LeanDocument<DefectiveGoodsDocument>>>((epc) => {
				return {
					updateOne: {
						filter: { epc, deleted: { $ne: true } },
						update: {
							$set: {
								storage_location: payload.storage_location,
								inbound_date: inboundDate,
								updated_by: new Types.ObjectId(user._id.toString())
							}
						},
						upsert: false
					}
				}
			})
		)

		return await super.findAll({ epc: { $in: payload.epcs } }, undefined, {
			readPreference: 'primary' satisfies mongo.ReadPreferenceMode,
			lean: { virtuals: true, autopopulate: true }
		})
	}

	async stockOut(payload: UpdateOutboundStatusDTO, user: TRequestUser) {
		const outboundDate = new Date()

		await this.defectiveGoodsModel.bulkWrite(
			payload.epcs.map((epc) => {
				const shouldDowngrade =
					payload.outbound_purpose === DefectiveGoodsOutboundPurpose.RUIN ||
					payload.outbound_purpose === DefectiveGoodsOutboundPurpose.DOWNGRADE
				const shouldShipOut = payload.outbound_purpose === DefectiveGoodsOutboundPurpose.SHIPPING

				const shouldDeactivate = payload.outbound_purpose !== DefectiveGoodsOutboundPurpose.DOWNGRADE

				return {
					updateOne: {
						filter: { epc, deleted: { $ne: true } },
						update: {
							$set: {
								outbound_purpose: payload.outbound_purpose,
								updated_by: new Types.ObjectId(user._id.toString()),
								...(!shouldShipOut && { po: payload.po }),
								...(shouldDowngrade ? { defective_category: DefectiveCategory.C_GRADE } : { po: payload.po }),
								...(shouldDeactivate && { outbound_date: outboundDate, deleted: true, deleted_at: new Date() })
							}
						},
						upsert: false
					}
				}
			})
		)

		return await super.findAll({ epc: { $in: payload.epcs } }, undefined, {
			readPreference: 'primary' satisfies mongo.ReadPreferenceMode,
			lean: { virtuals: true, autopopulate: true }
		})
	}
}
