import { FALLBACK_VALUE } from '@common/constants'
import { TRequestUser } from '@common/decorators'
import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { PaginationDTO } from '@modules/_base/dto/pagination.dto'
import { BaseMongoRepository } from '@modules/_base/repositories/base-mongo.abstract.repository'
import { DeleteManyDefectiveGoodsDTO } from '@modules/defective-goods/application/dto/defective-goods.dto'
import {
	UpdateInboundStatusDTO,
	UpdateOutboundStatusDTO
} from '@modules/defective-goods/application/dto/inoutbound.dto'
import { IDefectiveGoodsRepository } from '@modules/defective-goods/application/ports/defective-goods.repository.port'
import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose
} from '@modules/defective-goods/domain/constants'
import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import {
	DefectiveGoodsDomainModel,
	IDefectiveGoodsProps
} from '@modules/defective-goods/domain/models/defective-goods.model'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import chunk from 'lodash/chunk'
import { mongo, Types, type QueryOptions } from 'mongoose'
import { DefectiveGoods, DefectiveGoodsDocument, DefectiveGoodsModel } from '../schemas/defective-goods.schema'

@Injectable()
export class DefectiveGoodsRepository
	extends BaseMongoRepository<DefectiveGoodsDocument>
	implements IDefectiveGoodsRepository
{
	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION)
		private readonly defectiveGoodsModel: DefectiveGoodsModel
	) {
		super(defectiveGoodsModel)
	}

	async findById(id: string) {
		const defectiveGoods = await this.defectiveGoodsModel
			.findById(id, {
				readPreference: 'primary' satisfies mongo.ReadPreferenceMode
			})
			.lean<IDefectiveGoodsProps>(true)
		return new DefectiveGoodsDomainModel(defectiveGoods)
	}

	async create(documents: DefectiveGoodsDomainModel[]) {
		const chunks = chunk(documents, 1000)

		const models = await Promise.all(
			chunks.map(async (chunkedDocuments) => {
				const inserted = await this.defectiveGoodsModel.insertMany(
					chunkedDocuments.map((document) => document.toProps())
				)
				return inserted.map((document) => new DefectiveGoodsDomainModel(document.toObject<IDefectiveGoodsProps>()))
			})
		)
		return models.flat()
	}

	override async findAll(filter: Partial<IDefectiveGoods> = {}) {
		return await super.findAll({ deleted: false, ...filter }, undefined, {
			readPreference: 'primary' satisfies mongo.ReadPreferenceMode,
			lean: { virtuals: true, autopopulate: true }
		})
	}

	override async paginate(
		filter: Partial<IDefectiveGoods> = {},
		{ page, limit, ...options }: PaginationDTO & Omit<QueryOptions<IDefectiveGoods>, 'page' | 'limit'>
	) {
		const filterQuery = MongoQueryBuilder.from(filter)
			.whereFieldsAreEqual(
				'defective_category',
				'brand_name',
				'factory_shoes_style',
				'cust_shoes_style',
				'color_sn',
				'size_numcode',
				'sewing_line',
				'assembly_line'
			)
			.whereDateEqual('created_at', filter?.created_at)
			.build()

		const result = await this.defectiveGoodsModel.paginate(
			{ deleted: false, ...filterQuery },
			{
				page,
				limit,
				useCustomCountFn: async () => await this.defectiveGoodsModel.countDocuments(filterQuery),
				options: { ...options, readPreference: 'secondary' satisfies mongo.ReadPreferenceMode }
			}
		)

		return {
			data: result.docs,
			totalDocs: result.totalDocs,
			totalPages: result.totalPages,
			hasNextPage: result.hasNextPage,
			hasPrevPage: result.hasPrevPage,
			nextPage: result.nextPage ?? null,
			prevPage: result.prevPage ?? null,
			limit: result.limit,
			page: result.page ?? page
		} satisfies Pagination<IDefectiveGoods>
	}

	async updateById(id: string, update: Partial<IDefectiveGoods>) {
		const result = await this.defectiveGoodsModel.findByIdAndUpdate(id, { $set: update }, { new: true, lean: true })
		return result?._id.toString()
	}

	async deleteMany(filter: DeleteManyDefectiveGoodsDTO) {
		const filterQuery = MongoQueryBuilder.from(filter as DeleteManyDefectiveGoodsDTO & { _id })
			.whereFieldsAreEqual(
				'defective_category',
				'brand_name',
				'factory_shoes_style',
				'cust_shoes_style',
				'color_sn',
				'size_numcode',
				'sewing_line',
				'assembly_line'
			)
			.whereDateEqual('created_at')
			.when(Array.isArray(filter.including_ids), (qb) => qb.whereIn('_id', filter.including_ids as string[]))
			.when(Array.isArray(filter.excluding_ids), (qb) => qb.whereNotIn('_id', filter.excluding_ids))
			.build()

		const pendingDeleteItems = await this.defectiveGoodsModel
			.find(filterQuery, {
				readPreference: 'primary' satisfies mongo.ReadPreferenceMode
			})
			.lean<IDefectiveGoodsProps[]>(true)
			.then((docs) => docs.map((item) => new DefectiveGoodsDomainModel(item)))

		const chunks = chunk(pendingDeleteItems, 100)
		await Promise.all(chunks.map(async (chunk) => await super.softDeleteManyByIds(chunk.map((item) => item.id))))

		return pendingDeleteItems
	}

	async getInoutboundEpcs(stockFlow: 'inbound' | 'outbound', filter: Partial<IDefectiveGoods> = {}, take?: number) {
		const filterQueries = MongoQueryBuilder.from({ ...filter, combination_strategy: 'manually' })
			.whereEqual('combination_strategy')
			.whereEqual('unit')
			.whereEqual('defective_category')
			.whereContains('epc')
			.whereContains('brand_name')
			.whereContains('factory_shoes_style')
			.whereContains('po')
			.whereContains('mo_no')
			.whereContains('color_sn')
			.whereContains('size_numcode')
			.when(stockFlow === 'inbound', (qb) => qb.whereFieldsAreNull('inbound_date', 'storage_location'))
			.when(stockFlow === 'outbound', (qb) =>
				qb.whereFieldsAreNotNull('inbound_date', 'storage_location').whereFieldsAreNull('outbound_date')
			)
			.build()

		const totalDocs = take ?? (await this.defectiveGoodsModel.countDocuments(filterQueries))

		const data = await this.defectiveGoodsModel
			.find(filterQueries)
			.lean({ virtuals: true, autopopulate: true })
			.read('primary' satisfies mongo.ReadPreferenceMode)
			.limit(take ?? 50)

		return { data, totalDocs }
	}

	async getScanningSizeQty(epcs: string[]) {
		const data = await super.findAll(
			{ epc: { $in: epcs }, combination_strategy: { $ne: CombinationStrategy.MANUALLY } },
			{ factory_shoes_style: 1, color_sn: 1, size_code: 1, epc: 1 },
			{ lean: true }
		)

		const unknownEpcs = epcs.filter((item) => !data.some((d) => d.epc === item))

		const groupedData = new Map<string, Map<string, number>>()

		data.forEach((item) => {
			const groupKey = `${item.factory_shoes_style}/${item.color_sn}`
			const sizeKey = item.size_numcode

			if (!groupedData.has(groupKey)) {
				groupedData.set(groupKey, new Map<string, number>())
			}

			const sizeMap = groupedData.get(groupKey)
			sizeMap.set(sizeKey, (sizeMap.get(sizeKey) || 0) + 1)
		})

		const result = Array.from(groupedData.entries()).map(([group, sizes]) => {
			const [factory_shoes_style, color_sn] = group.split('/')
			return {
				factory_shoes_style,
				color_sn,
				sizes: Array.from(sizes.entries()).map(([size_code, qty]) => ({
					size_code,
					qty
				}))
			}
		})

		if (unknownEpcs.length > 0)
			result.push({
				factory_shoes_style: FALLBACK_VALUE,
				color_sn: FALLBACK_VALUE,
				sizes: [{ size_code: FALLBACK_VALUE, qty: unknownEpcs.length }]
			})

		return result
	}

	async stockIn(
		payload: UpdateInboundStatusDTO,
		user: TRequestUser,
		filters: Partial<IDefectiveGoods> | Record<string, any> = {},
		take: number = 0
	) {
		const inboundDate = new Date()
		const epcs =
			payload.combination_strategy === CombinationStrategy.MANUALLY
				? await this.getInoutboundEpcs('inbound', filters, take).then((res) => res.data.map((doc) => doc.epc))
				: payload.epcs

		const chunks = chunk(epcs, 1000)

		for (const chunkedEpcs of chunks) {
			await super.updateMany(
				{ epc: { $in: chunkedEpcs }, deleted: false },
				{
					storage_location: payload.storage_location,
					inbound_date: inboundDate,
					updated_by: new Types.ObjectId(user._id.toString())
				}
			)
		}

		return await this.defectiveGoodsModel.distinct<string, string>(
			'_id',
			{ epc: { $in: payload.epcs } },
			{ readPreference: 'primary' satisfies mongo.ReadPreferenceMode }
		)
	}

	async stockOut(
		payload: UpdateOutboundStatusDTO,
		user: TRequestUser,
		filters: Partial<IDefectiveGoods> | Record<string, any> = {},
		take: number = 0
	) {
		const outboundDate = new Date()

		const epcs =
			payload.combination_strategy === CombinationStrategy.MANUALLY
				? await this.getInoutboundEpcs('outbound', filters, take).then((res) => res.data.map((doc) => doc.epc))
				: payload.epcs

		const chunks = chunk(epcs, 1000)

		const shouldDowngrade =
			payload.outbound_purpose === DefectiveGoodsOutboundPurpose.RUIN ||
			payload.outbound_purpose === DefectiveGoodsOutboundPurpose.DOWNGRADE
		const shouldShipOut = payload.outbound_purpose === DefectiveGoodsOutboundPurpose.SHIPPING

		const shouldDeactivate = payload.outbound_purpose !== DefectiveGoodsOutboundPurpose.DOWNGRADE

		for (const chunkedEpcs of chunks) {
			await super.updateMany(
				{ epc: { $in: chunkedEpcs }, deleted: false },
				{
					outbound_purpose: payload.outbound_purpose,
					updated_by: new Types.ObjectId(user._id.toString()),
					...(!shouldShipOut && { po: payload.po }),
					...(shouldDowngrade ? { defective_category: DefectiveCategory.C_GRADE } : { po: payload.po }),
					...(shouldDeactivate && { outbound_date: outboundDate, deleted: true, deleted_at: new Date() })
				}
			)
		}

		return await this.defectiveGoodsModel.distinct<string, string>(
			'_id',
			{ epc: { $in: payload.epcs } },
			{ readPreference: 'primary' satisfies mongo.ReadPreferenceMode }
		)
	}
}
