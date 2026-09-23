import {
	type DeleteResult,
	type FindManyOptions,
	type FindOptionsWhere,
	type InsertResult,
	type UpdateResult
} from 'typeorm'
import { BaseAbstractEntity } from '../base.abstract.entity'
import { PaginationDTO } from '../dto/pagination.dto'
import { IBaseRepository } from './base.abstract.repository.interface'

export interface IBaseTypeOrmRepository<Entity extends BaseAbstractEntity> extends IBaseRepository<
	Entity,
	number,
	FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[],
	PaginationDTO & Omit<FindManyOptions<Entity>, 'where'>,
	InsertResult,
	UpdateResult,
	DeleteResult,
	DeleteResult,
	DeleteResult,
	UpdateResult
> {
	// insertOne(payload: DeepPartial<Entity>): Promise<Entity>
	// insertMany(payload: DeepPartial<Entity>[]): Promise<InsertResult>
	// findAll(): Promise<Entity[]>
	// findOneById(id: number): Promise<Entity>
	// updateOneById(id: number, partialEntity: QueryDeepPartialEntity<Entity>): Promise<UpdateResult>
	// deleteOneById(id: number): Promise<DeleteResult>
	// deleteManyByIds(ids: number[]): Promise<DeleteResult>
	// softDeleteOneById(id: number): Promise<DeleteResult>
	// softDeleteManyByIds(ids: number[]): Promise<DeleteResult>
	// restoreOneById(id: number): Promise<UpdateResult>
	// restoreManyByIds(ids: number[]): Promise<UpdateResult>
	// paginate(
	// 	condition: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[],
	// 	{ page, limit, ...options }: PaginationDTO & Omit<FindManyOptions<Entity>, 'where'>
	// ): Promise<Pagination<Entity>>
}
