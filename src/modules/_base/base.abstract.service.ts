import { Injectable } from '@nestjs/common'
import { DeleteResult, FindOptionsWhere, Repository } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { BaseAbstractEntity } from './base.abstract.entity'
import { IBaseService } from './base.service.interface'

@Injectable()
export abstract class BaseAbstractService<Entity extends BaseAbstractEntity> implements IBaseService<Entity> {
	protected constructor(private repository: Repository<Entity>) {}

	async insertOne(payload: unknown & Entity) {
		const newRecord = this.repository.create(payload)
		return await this.repository.save(newRecord)
	}

	async findAll(): Promise<Entity[]> {
		return await this.repository.find()
	}

	async findOneById(id: number): Promise<Entity> {
		return await this.repository.findOneBy({ keyid: id } as FindOptionsWhere<Entity>)
	}

	async updateOneById(id: number, partialEntity: QueryDeepPartialEntity<Entity>) {
		return await this.repository.update(id, partialEntity)
	}

	async deletOneById(id: number): Promise<DeleteResult> {
		return await this.repository.delete(id)
	}
}
