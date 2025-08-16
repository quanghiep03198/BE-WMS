import {
	type DeepPartial,
	type DeleteResult,
	type FindManyOptions,
	type FindOptionsWhere,
	type UpdateResult
} from 'typeorm'
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { BaseAbstractEntity } from './base.abstract.entity'
import { PaginationDTO } from './dto/pagination.dto'

export interface IBaseService<Entity extends BaseAbstractEntity> {
	insertOne(payload: DeepPartial<Entity>): Promise<Entity>
	findAll(): Promise<Entity[]>
	findOneById(id: number): Promise<Entity>
	updateOneById(id: number, partialEntity: QueryDeepPartialEntity<Entity>): Promise<UpdateResult>
	deleteOneById(id: number): Promise<DeleteResult>
	softDeleteOneById(id: number): Promise<DeleteResult>
	restoreById(id: number): Promise<UpdateResult>
	paginate(
		condition: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[],
		{ page, limit, ...options }: PaginationDTO & Omit<FindManyOptions<Entity>, 'where'>
	)
}
