import { Injectable } from '@nestjs/common'
import { Document, FilterQuery, PaginateModel, ProjectionType, QueryOptions, Types, UpdateQuery } from 'mongoose'
import { SoftDeleteModel } from 'mongoose-delete'
import { PaginationDTO } from '../dto/pagination.dto'
import {
	IBaseMongoRepository,
	MongooseDeleteResult,
	MongooseRestoreResult
} from '../interfaces/base-mongo.repository.interface'

export type BaseMongooseModel<TDocument extends Document> = PaginateModel<TDocument> & SoftDeleteModel<TDocument>

/**
 * @description
 * Base Abstract Mongoose Service
 * - Provides common CRUD operations for mongoose documents
 * - Requires the model to have `mongoose-paginate-v2` and `mongoose-delete` plugins registered
 * @export
 * @abstract
 * @template TDocument
 * @implements `IBaseMongooseService<TDocument>`
 */
@Injectable()
export abstract class BaseMongoRepository<TDocument extends Document> implements IBaseMongoRepository<TDocument> {
	protected constructor(private readonly model: BaseMongooseModel<TDocument>) {}

	/**
	 * @description Insert one document
	 * @param payload
	 * @returns
	 */
	async createOne(payload: Partial<TDocument>): Promise<TDocument> {
		const newRecord = new this.model(payload)
		return await newRecord.save()
	}

	/**
	 * @description Insert multiple documents
	 * @param payload
	 * @returns
	 */
	async insertMany(payload: Partial<TDocument>[]): Promise<TDocument[]> {
		return (await this.model.insertMany(payload)) as unknown as TDocument[]
	}

	/**
	 * @description Find all documents matching the filter
	 * @param filter
	 * @param projection
	 * @param options
	 * @returns
	 */
	async findAll(
		filter: FilterQuery<TDocument> = {},
		projection?: ProjectionType<TDocument>,
		options?: QueryOptions<TDocument>,
		withDeleted = false
	): Promise<TDocument[]> {
		if (withDeleted) return await this.model.findWithDeleted(filter, projection, options)
		return await this.model.find(filter, projection, options)
	}

	/**
	 * @description Find one document by its ID
	 * @param id
	 * @param projection
	 * @returns
	 */
	async findOneById(id: string | Types.ObjectId, projection?: ProjectionType<TDocument>): Promise<TDocument | null> {
		return await this.model.findById(id, projection).lean<TDocument>({ virtuals: true })
	}

	/**
	 * @description Find one document matching the filter
	 * @param filter
	 * @param projection
	 * @returns
	 */
	async findOne(filter: FilterQuery<TDocument>, projection?: ProjectionType<TDocument>): Promise<TDocument | null> {
		return await this.model.findOne(filter, projection)
	}

	/**
	 * @description Update a document by its ID
	 * @param id
	 * @param payload
	 * @returns
	 */
	async updateOneById(id: string | Types.ObjectId, payload: UpdateQuery<TDocument>): Promise<TDocument | null> {
		return await this.model.findByIdAndUpdate(id, payload, { new: true })
	}

	/**
	 * @description Update multiple documents matching the filter
	 * @param filter
	 * @param payload
	 * @returns
	 */
	async updateMany(filter: FilterQuery<TDocument>, payload: UpdateQuery<TDocument>): Promise<MongooseRestoreResult> {
		const result = await this.model.updateMany(filter, payload)
		return {
			acknowledged: result.acknowledged,
			matchedCount: result.matchedCount,
			modifiedCount: result.modifiedCount
		}
	}

	/**
	 * @description Permanently delete a document by its ID
	 * @param id
	 * @returns
	 */
	async deleteOneById(id: string | Types.ObjectId): Promise<TDocument | null> {
		return await this.model.findByIdAndDelete(id)
	}

	/**
	 * @description Permanently delete multiple documents by their IDs
	 * @param ids
	 * @returns
	 */
	async deleteManyByIds(ids: Array<string | Types.ObjectId>): Promise<MongooseDeleteResult> {
		const result = await this.model.deleteMany({ _id: { $in: ids } } as FilterQuery<TDocument>)
		return { acknowledged: result.acknowledged, deletedCount: result.deletedCount }
	}

	/**
	 * @description Soft delete a document by its ID
	 * @param id
	 * @returns
	 */
	async softDeleteOneById(id: string | Types.ObjectId): Promise<MongooseDeleteResult> {
		return (await this.model.deleteById(id)) as unknown as MongooseDeleteResult
	}

	/**
	 * @description Soft delete multiple documents by their IDs
	 * @param ids
	 * @returns
	 */
	async softDeleteManyByIds(ids: Array<string | Types.ObjectId>): Promise<MongooseDeleteResult> {
		return (await this.model.delete({ _id: { $in: ids } })) as unknown as MongooseDeleteResult
	}

	/**
	 * @description Restore a soft-deleted document by its ID
	 * @param id
	 * @returns
	 */
	async restoreOneById(id: string | Types.ObjectId): Promise<MongooseRestoreResult> {
		return (await this.model.restore({ _id: id })) as unknown as MongooseRestoreResult
	}

	/**
	 * @description Restore multiple soft-deleted documents by their IDs
	 * @param ids
	 * @returns
	 */
	async restoreManyByIds(ids: Array<string | Types.ObjectId>): Promise<MongooseRestoreResult> {
		return (await this.model.restore({ _id: { $in: ids } })) as unknown as MongooseRestoreResult
	}

	/**
	 * @description Paginate documents based on filter
	 * @param {FilterQuery<TDocument>} filter
	 * @param {PaginationDTO & Omit<QueryOptions<TDocument>, 'page' | 'limit'>} options { page, limit, ...queryOptions }
	 * @returns {Pagination<TDocument>}
	 */
	async paginate(
		filter: FilterQuery<TDocument>,
		{ page, limit, ...options }: PaginationDTO & Omit<QueryOptions<TDocument>, 'page' | 'limit'>
	): Promise<Pagination<TDocument>> {
		const result = await this.model.paginate(filter, { page, limit, ...options })

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
		} satisfies Pagination<TDocument>
	}
}
