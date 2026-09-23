import { Injectable } from '@nestjs/common'
import { Repository } from 'typeorm'
import { BaseAbstractEntity } from '../base.abstract.entity'
import { BaseTypeOrmRepository } from '../repositories/base-typeorm.abstract.repository'

@Injectable()
export abstract class BaseTypeOrmService<Entity extends BaseAbstractEntity> extends BaseTypeOrmRepository<Entity> {
	protected constructor(repository: Repository<Entity>) {
		super(repository)
	}
}
