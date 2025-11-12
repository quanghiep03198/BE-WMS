import { Injectable } from '@nestjs/common'
import { DeepPartial, DeleteResult, FindManyOptions, FindOptionsWhere, Repository, UpdateResult } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { BaseAbstractEntity } from './base.abstract.entity'
import { IBaseService } from './base.service.interface'
import { PaginationDTO } from './dto/pagination.dto'

/**
 * @description
 * Base Abstract Service
 * - Provides common CRUD operations for entities
 * - Extends functionality for specific entity services
 * @export
 * @abstract
 * @template Entity
 * @implements `IBaseService<Entity>`
 */
@Injectable()
export abstract class BaseAbstractService<Entity extends BaseAbstractEntity> implements IBaseService<Entity> {
	protected constructor(private readonly repository: Repository<Entity>) {}

	/**
	 * @description Insert one record
	 * @param payload
	 * @returns
	 */
	async insertOne(payload: DeepPartial<Entity>) {
		const newRecord = this.repository.create(payload)
		return await this.repository.save(newRecord)
	}

	/**
	 * @description Insert multiple records
	 * @param payload
	 * @returns
	 */
	async insertMany(payload: DeepPartial<Entity>[]) {
		const newRecords = this.repository.create(payload)
		return await this.repository.insert(newRecords as FirstParameter<typeof this.repository.insert>)
	}

	/**
	 * @description Find all records
	 * @returns
	 */

	async findAll(): Promise<Entity[]> {
		return await this.repository.find()
	}

	/**
	 * @description Find one record by its ID
	 * @param id
	 * @returns
	 */
	async findOneById(id: number): Promise<Entity> {
		return await this.repository.findOneBy({ id: id } as FindOptionsWhere<Entity>)
	}

	/**
	 * @description Update a record by its ID
	 * @param id
	 * @param partialEntity
	 * @returns
	 */
	async updateOneById(id: number, partialEntity: QueryDeepPartialEntity<Entity>) {
		return await this.repository.update(id, partialEntity)
	}

	/**
	 * @description Permanently delete a record by its ID
	 * @param id
	 * @returns
	 */
	async deleteOneById(id: number): Promise<DeleteResult> {
		return await this.repository.delete(id)
	}

	/**
	 * @description Permanently delete multiple records by their IDs
	 * @param ids
	 * @returns
	 */
	async deleteManyByIds(ids: number[]): Promise<DeleteResult> {
		return await this.repository.delete(ids)
	}

	/**
	 * @description Soft delete a record by its ID
	 * @param id
	 * @returns
	 */
	async softDeleteOneById(id: number): Promise<DeleteResult> {
		return await this.repository.softDelete(id)
	}

	/**
	 * @description Soft delete multiple records by their IDs
	 * @param ids
	 * @returns
	 */
	async softDeleteManyByIds(ids: number[]): Promise<DeleteResult> {
		return await this.repository.softDelete(ids)
	}

	/**
	 * @description Restore a soft-deleted record by its ID
	 * @param id
	 * @returns
	 */
	async restoreOneById(id: number): Promise<UpdateResult> {
		return await this.repository.restore(id)
	}

	/**
	 * @description Restore multiple soft-deleted records by their IDs
	 * @param ids
	 * @returns
	 */
	async restoreManyByIds(ids: number[]): Promise<UpdateResult> {
		return await this.repository.restore(ids)
	}

	/**
	 * @description Paginate records based on condition
	 * @param {FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[]} condition
	 * @param {PaginationDTO & Omit<FindManyOptions<Entity>, 'where'>} options { page, limit, ...findOptions }
	 * @returns {Pagination<Entity>}
	 */
	async paginate(
		condition: FindOptionsWhere<Entity> | FindOptionsWhere<Entity>[],
		{ page, limit, ...options }: PaginationDTO & Omit<FindManyOptions<Entity>, 'where'>
	) {
		const [data, totalDocs] = await this.repository.findAndCount({
			skip: (page - 1) * limit,
			take: limit,
			where: condition,
			...options
		})
		const totalPages = Math.ceil(totalDocs / limit)

		return {
			data,
			totalDocs,
			totalPages,
			hasNextPage: page < totalPages,
			hasPrevPage: page > 1,
			nextPage: page < totalPages ? page + 1 : null,
			prevPage: page > 1 ? page - 1 : null,
			limit,
			page
		} satisfies Pagination<Entity>
	}
}
