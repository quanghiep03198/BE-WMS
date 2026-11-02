import { FALLBACK_VALUE } from '@common/constants'
import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION, DUPLICATE_KEY_ERROR_CODE } from '@databases/constants'
import { PaginationDTO } from '@modules/_base/dto/pagination.dto'
import { BaseMongoRepository } from '@modules/_base/repositories/base-mongo.abstract.repository'
import { DeleteManyDefectiveGoodsDTO } from '@modules/defective-goods/application/dto/defective-goods.dto'
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
import pick from 'lodash/pick'
import { type FilterQuery, mongo, ProjectionType, type QueryOptions, Types } from 'mongoose'
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

	async create(models: DefectiveGoodsDomainModel[]) {
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

	async findById(id: string) {
		const defectiveGoods = await this.defectiveGoodsModel
			.findById(id, {
				readPreference: 'primary' satisfies mongo.ReadPreferenceMode
			})
			.lean<IDefectiveGoodsProps>(true)
		return new DefectiveGoodsDomainModel(defectiveGoods)
	}

	async find(
		filter: FilterQuery<DefectiveGoodsDocument>,
		projection: ProjectionType<DefectiveGoodsDocument> = null,
		options: QueryOptions<DefectiveGoodsDocument> = { lean: { virtuals: true, autopopulate: true } },
		queryFn: 'find' | 'findWithDeleted' | 'findDeleted' = 'find'
	) {
		const findFn = this.defectiveGoodsModel[queryFn]

		const documents = await findFn(filter, projection, options).lean<IDefectiveGoodsProps[]>({
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
			this.logger.debug(`Cached count for filter: ${JSON.stringify(filter)} is ${cachedCount}`)
			if (Number.isNaN(+cachedCount)) return cachedCount

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

	async updateById(id: string, update: DefectiveGoodsDomainModel) {
		const result = await this.defectiveGoodsModel
			.findByIdAndUpdate(id, update.toProps())
			.lean<IDefectiveGoodsProps>({ virtuals: true, autopopulate: true })
		return new DefectiveGoodsDomainModel(result)
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
		await Promise.all(
			chunks.map(async (chunk) => await super.softDeleteManyByIds(chunk.map((item) => item.id.toString())))
		)

		return pendingDeleteItems
	}

	async getInoutboundEpcs(
		stockFlow: 'inbound' | 'outbound',
		filter: Partial<IDefectiveGoods> = {},
		{ limit = 50, page = 1, cursor, direction = 'next' }: IKeysetParams = {}
	) {
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

		// direction chỉ có nghĩa khi có cursor
		const isPrev = !!cursor && direction === 'prev'

		// Điều kiện keyset: sort _id giảm dần -> next lấy _id < cursor, prev lấy _id > cursor
		const keysetQuery = cursor
			? { $and: [filterQueries, { _id: { [isPrev ? '$gt' : '$lt']: this.decodeCursor(cursor) } }] }
			: filterQueries

		const [totalDocs, rows] = await Promise.all([
			// Đếm theo filter gốc, KHÔNG kèm điều kiện cursor
			this.defectiveGoodsModel.countDocuments(filterQueries),
			this.defectiveGoodsModel
				.find(keysetQuery)
				.sort({ _id: isPrev ? 1 : -1 })
				.limit(limit + 1) // lấy dư 1 bản ghi để biết còn trang tiếp theo hay không
				.lean({ virtuals: true, autopopulate: true })
				.read('secondary' satisfies mongo.ReadPreferenceMode)
		])

		const hasMore = rows.length > limit
		const data = hasMore ? rows.slice(0, limit) : rows
		if (isPrev) data.reverse() // trả về đúng thứ tự hiển thị (giảm dần)

		// Đi tới (next): "còn nữa" = hasMore, "có trang trước" = đã có cursor
		// Đi lùi (prev): ngược lại, và chắc chắn còn trang sau vì mình vừa từ đó quay lại
		const hasNextPage = isPrev ? true : hasMore
		const hasPrevPage = isPrev ? hasMore : !!cursor

		return {
			data,
			hasNextPage,
			hasPrevPage,
			limit,
			page,
			nextPage: hasNextPage ? page + 1 : null,
			prevPage: hasPrevPage ? Math.max(page - 1, 1) : null,
			totalDocs,
			totalPages: Math.ceil(totalDocs / limit),
			nextCursor: hasNextPage && data.length ? this.encodeCursor(data[data.length - 1]._id) : null,
			prevCursor: hasPrevPage && data.length ? this.encodeCursor(data[0]._id) : null
		} satisfies IKeysetPagination<ArrayElement<typeof rows>>
	}

	private encodeCursor(id: unknown): string {
		return Buffer.from(String(id)).toString('base64url')
	}

	private decodeCursor(cursor: string): Types.ObjectId {
		const id = Buffer.from(cursor, 'base64url').toString()
		// if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid cursor')
		return new Types.ObjectId(id)
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

	async stockIn(models: DefectiveGoodsDomainModel[]) {
		const inboundDate = new Date()

		await this.defectiveGoodsModel.bulkWrite(
			models.map((m) => ({
				updateOne: {
					filter: { epc: m.epc, deleted: false },
					update: {
						inbound_date: inboundDate,
						...pick(m.toProps(), ['storage_location', 'updated_by'])
					}
				}
			}))
		)
	}

	async stockOut(models: DefectiveGoodsDomainModel[]) {
		const outboundDate = new Date()

		await this.defectiveGoodsModel.bulkWrite(
			models.map((m) => ({
				updateOne: {
					filter: { epc: m.epc, deleted: false },
					update: {
						outbound_date: outboundDate,
						...pick(m.toProps(), ['outbound_purpose', 'updated_by'])
					}
				}
			}))
		)
	}
}
