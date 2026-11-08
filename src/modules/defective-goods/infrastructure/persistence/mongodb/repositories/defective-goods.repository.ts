import { FALLBACK_VALUE } from '@common/constants'
import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION, DUPLICATE_KEY_ERROR_CODE } from '@databases/constants'
import { PaginationDTO } from '@modules/_base/dto/pagination.dto'
import { BaseMongoRepository } from '@modules/_base/repositories/base-mongo.abstract.repository'
import { DeleteManyDefectiveGoodsDTO } from '@modules/defective-goods/application/dto/defective-goods.dto'
import { InoutboundEpcQueryDTO } from '@modules/defective-goods/application/dto/filter-query.dto'
import {
	DEFECTIVE_GOODS_CACHE_REPOSITORY,
	IDefectiveGoodsCacheRepository
} from '@modules/defective-goods/application/ports/defective-goods-cache.port'
import {
	IDefectiveGoodsRepository,
	IKeysetPagination,
	IKeysetParams
} from '@modules/defective-goods/application/ports/defective-goods.repository.port'
import { CombinationStrategy } from '@modules/defective-goods/domain/constants'
import { ActiveEpcsRecombinationException } from '@modules/defective-goods/domain/exceptions'
import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import {
	DefectiveGoodsDomainModel,
	IDefectiveGoodsProps
} from '@modules/defective-goods/domain/models/defective-goods.model'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import chunk from 'lodash/chunk'
import { type FilterQuery, LeanDocument, mongo, ProjectionType, type QueryOptions, Types } from 'mongoose'
import { DefectiveGoods, DefectiveGoodsDocument, DefectiveGoodsModel } from '../schemas/defective-goods.schema'

@Injectable()
export class DefectiveGoodsRepository
	extends BaseMongoRepository<DefectiveGoodsDocument>
	implements IDefectiveGoodsRepository
{
	private readonly logger = new Logger(DefectiveGoodsRepository.name)

	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION)
		private readonly defectiveGoodsModel: DefectiveGoodsModel,
		@Inject(DEFECTIVE_GOODS_CACHE_REPOSITORY)
		private readonly defectiveGoodsCacheRepository: IDefectiveGoodsCacheRepository
	) {
		super(defectiveGoodsModel)
	}

	public async create(models: DefectiveGoodsDomainModel[]) {
		try {
			const chunks = chunk(models, 1000)

			const created = await Promise.all(
				chunks.map(async (chunkedDocuments) => {
					const inserted = await this.defectiveGoodsModel.insertMany(
						chunkedDocuments.map((document) => document.toProps())
					)
					return inserted.map(
						(document) => new DefectiveGoodsDomainModel(document.toObject<IDefectiveGoodsProps>())
					)
				})
			)
			return created.flat()
		} catch (error) {
			if (error['code'] === DUPLICATE_KEY_ERROR_CODE) throw new ActiveEpcsRecombinationException()
			throw error
		}
	}

	public async findById(id: string) {
		const defectiveGoods = await this.defectiveGoodsModel
			.findById(id, {
				readPreference: 'primary' satisfies mongo.ReadPreferenceMode
			})
			.lean<IDefectiveGoodsProps>(true)
		return new DefectiveGoodsDomainModel(defectiveGoods)
	}

	public async find(
		filter: FilterQuery<DefectiveGoodsDocument>,
		projection: ProjectionType<DefectiveGoodsDocument> = null,
		options: QueryOptions<DefectiveGoodsDocument> = { lean: { virtuals: true, autopopulate: true } },
		queryFn: Extract<keyof DefectiveGoodsModel, 'find' | 'findWithDeleted' | 'findDeleted'> = 'find' as const
	) {
		const documents = await this.defectiveGoodsModel[queryFn](filter, projection, options).lean<
			IDefectiveGoodsProps[]
		>({
			virtuals: true,
			autopopulate: true
		})
		return documents.map((document: IDefectiveGoodsProps) => new DefectiveGoodsDomainModel(document))
	}

	override async paginate(
		filter: FilterQuery<DefectiveGoodsDocument>,
		{ page, limit = 10 }: PaginationDTO & Omit<QueryOptions<DefectiveGoodsDocument>, 'page' | 'limit'>
	) {
		const filterQuery = MongoQueryBuilder.from(filter)
			.whereEqual('deleted', false)
			.whereEqual('defective_category')
			.whereEqual('brand_name')
			.whereEqual('factory_shoes_style')
			.whereEqual('cust_shoes_style')
			.whereEqual('color_sn')
			.whereEqual('size_numcode')
			.whereEqual('sewing_line')
			.whereEqual('assembly_line')
			.whereDateEqual('created_at')
			.build()

		const countDocuments = async (): Promise<number> => {
			const cachedCount = await this.defectiveGoodsCacheRepository.getCount(filter)
			if (typeof cachedCount === 'number') return cachedCount
			const totalDocs = await this.defectiveGoodsModel.countDocuments(filterQuery)
			return await this.defectiveGoodsCacheRepository.setCount(filter, totalDocs)
		}

		const result = await this.defectiveGoodsModel.paginate(filterQuery, {
			page,
			limit,
			leanWithVirtuals: true,
			autopopulate: true,
			useCustomCountFn: countDocuments
		})

		return {
			data: result.docs,
			page: result.page,
			limit: result.limit,
			totalDocs: result.totalDocs,
			totalPages: result.totalPages,
			hasNextPage: result.hasNextPage,
			hasPrevPage: result.hasPrevPage,
			nextPage: result.nextPage,
			prevPage: result.prevPage
		} satisfies Pagination<IDefectiveGoods>
	}

	public async updateById(id: string, update: DefectiveGoodsDomainModel) {
		const result = await this.defectiveGoodsModel
			.findByIdAndUpdate(id, update.toProps())
			.lean<IDefectiveGoodsProps>({ virtuals: true, autopopulate: true })
		return new DefectiveGoodsDomainModel(result)
	}

	public async deleteMany(filter: DeleteManyDefectiveGoodsDTO) {
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
		await Promise.all(
			chunks.map(async (chunk) => await super.softDeleteManyByIds(chunk.map((item) => item.id.toString())))
		)

		return pendingDeleteItems
	}

	public async getInoutboundEpcs(
		stockFlow: 'inbound' | 'outbound',
		filter: Omit<InoutboundEpcQueryDTO, 'cursor' | 'direction' | 'page' | 'limit' | 'take'>,
		{ page = 1, take, cursor, direction = 'next' }: IKeysetParams
	) {
		const PER_PAGE = 50
		const isPrev = !!cursor && direction === 'prev'

		const queryBuilder = MongoQueryBuilder.from({
			...filter,
			_id: cursor ? this.decodeCursor(cursor) : null,
			deleted: false,
			combination_strategy: CombinationStrategy.MANUALLY,
			inbound_at: null,
			outbound_at: null,
			storage_location: null
		})
			.whereFieldsAreEqual(
				'defective_category',
				'brand_name',
				'po',
				'mo_no',
				'factory_shoes_style',
				'color_sn',
				'size_numcode',
				'unit'
			)
			.when(stockFlow === 'inbound', (qb) => qb.whereFieldsAreNull('inbound_at', 'storage_location'))
			.when(stockFlow === 'outbound', (qb) =>
				qb.whereFieldsAreNotNull('inbound_at', 'storage_location').whereFieldsAreNull('outbound_at')
			)

		const filterQueries = queryBuilder.build()
		const keysetFilterQueries = queryBuilder
			.when(isPrev, (qb) => qb.whereLessThan('_id'))
			.when(!isPrev && !!cursor, (qb) => qb.whereGreaterThan('_id'))
			.build()

		/**
		 * @description Get the total count of documents matching the query, using the cache if available. Respect the 'take' limit if provided.
		 * * If we have a cached count, use it directly
		 * * In case `take` is available and less than the cached count, use `take` primarily (Frontend will likely request fewer items than the total count).
		 */
		const countDocuments = async (): Promise<number> => {
			const cachedCount = await this.defectiveGoodsCacheRepository.getCount(filterQueries)
			if (typeof cachedCount === 'number') return take && take < cachedCount ? take : cachedCount
			const totalDocs = await this.defectiveGoodsModel.countDocuments(filterQueries)
			await this.defectiveGoodsCacheRepository.setCount(filterQueries, totalDocs)
			return take && take < totalDocs ? take : totalDocs
		}

		const _limit = typeof take === 'number' && take < PER_PAGE ? take : PER_PAGE
		const sortingDirection = isPrev ? 1 : -1

		const [rows, totalDocs] = await Promise.all([
			this.defectiveGoodsModel
				.find(keysetFilterQueries)
				.select(
					'_id epc defective_category brand_name po mo_no factory_shoes_style color_sn size_numcode unit inbound_at'
				)
				.sort({ _id: sortingDirection })
				.limit(_limit + 1)
				.lean<
					Pick<
						LeanDocument<DefectiveGoodsDocument>,
						| '_id'
						| 'epc'
						| 'defective_category'
						| 'brand_name'
						| 'po'
						| 'mo_no'
						| 'factory_shoes_style'
						| 'color_sn'
						| 'size_numcode'
						| 'unit'
						| 'inbound_at'
					>[]
				>(),
			countDocuments()
		])

		const totalPages = Math.ceil(totalDocs / _limit)
		const hasNextPage = page < totalPages
		const data = hasNextPage ? rows.slice(0, _limit) : rows
		const hasPrevPage = isPrev ? page < totalPages && page > 1 : !!cursor

		if (isPrev) data.reverse() // reverse to maintain correct display order for previous page

		return {
			data,
			hasNextPage,
			hasPrevPage,
			limit: _limit,
			page,
			nextPage: hasNextPage ? page + 1 : null,
			prevPage: hasPrevPage ? Math.max(page - 1, 1) : null,
			totalDocs,
			totalPages,
			nextCursor: hasNextPage && data.length ? this.encodeCursor(data[data.length - 1]._id) : null,
			prevCursor: hasPrevPage && data.length ? this.encodeCursor(data[0]._id) : null
		} satisfies IKeysetPagination<ArrayElement<typeof rows>>
	}

	private encodeCursor(id: unknown): string {
		return Buffer.from(String(id)).toString('base64url')
	}

	private decodeCursor(cursor: string): Types.ObjectId {
		const id = Buffer.from(cursor, 'base64url').toString()
		if (!Types.ObjectId.isValid(id)) throw new Error('Invalid cursor')
		return new Types.ObjectId(id)
	}

	public async getScanningSizeQty(epcs: string[]) {
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

	public async stockIn(models: DefectiveGoodsDomainModel[]) {
		await this.defectiveGoodsModel.bulkWrite(
			models.map((m) => ({
				updateOne: {
					filter: { epc: m.epc, deleted: false },
					update: m.toProps('storage_location', 'inbound_at', 'updated_by')
				}
			}))
		)
	}

	public async stockOut(models: DefectiveGoodsDomainModel[]) {
		await this.defectiveGoodsModel.bulkWrite(
			models.map((m) => ({
				updateOne: {
					filter: { epc: m.epc, deleted: false },
					update: m.toProps('outbound_purpose', 'outbound_at', 'po', 'deleted', 'updated_by')
				}
			}))
		)
	}
}
