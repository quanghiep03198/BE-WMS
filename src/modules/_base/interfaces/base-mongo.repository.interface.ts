import { type Document, type FilterQuery, type QueryOptions, type Types } from 'mongoose'
import { type PaginationDTO } from '../dto/pagination.dto'
import { type IBaseRepository } from '../interfaces/base.abstract.repository.interface'

export interface MongooseDeleteResult {
	acknowledged: boolean
	deletedCount: number
}

export interface MongooseRestoreResult {
	acknowledged: boolean
	matchedCount: number
	modifiedCount: number
}

export interface IBaseMongoRepository<TDocument extends Document> extends IBaseRepository<
	TDocument,
	string | Types.ObjectId,
	FilterQuery<TDocument>,
	PaginationDTO & Omit<QueryOptions<TDocument>, 'page' | 'limit'>,
	TDocument[],
	TDocument | null,
	TDocument | null,
	MongooseDeleteResult,
	MongooseDeleteResult,
	MongooseRestoreResult
> {
	// createOne(payload: Partial<TDocument>): Promise<TDocument>
	// insertMany(payload: Partial<TDocument>[]): Promise<TDocument[]>
	// findAll(
	// 	filter?: FilterQuery<TDocument>,
	// 	projection?: ProjectionType<TDocument>,
	// 	options?: QueryOptions<TDocument>
	// ): Promise<TDocument[]>
	// findOneById(id: string | Types.ObjectId, projection?: ProjectionType<TDocument>): Promise<TDocument | null>
	// findOne(filter: FilterQuery<TDocument>, projection?: ProjectionType<TDocument>): Promise<TDocument | null>
	// updateOneById(id: string | Types.ObjectId, payload: UpdateQuery<TDocument>): Promise<TDocument | null>
	// updateMany(filter: FilterQuery<TDocument>, payload: UpdateQuery<TDocument>): Promise<MongooseRestoreResult>
	// deleteOneById(id: string | Types.ObjectId): Promise<TDocument | null>
	// deleteManyByIds(ids: Array<string | Types.ObjectId>): Promise<MongooseDeleteResult>
	// softDeleteOneById(id: string | Types.ObjectId): Promise<MongooseDeleteResult>
	// softDeleteManyByIds(ids: Array<string | Types.ObjectId>): Promise<MongooseDeleteResult>
	// restoreOneById(id: string | Types.ObjectId): Promise<MongooseRestoreResult>
	// restoreManyByIds(ids: Array<string | Types.ObjectId>): Promise<MongooseRestoreResult>
	// paginate(
	// 	filter: FilterQuery<TDocument>,
	// 	{ page, limit, ...options }: PaginationDTO & Omit<QueryOptions<TDocument>, 'page' | 'limit'>
	// ): Promise<Pagination<TDocument>>
}
