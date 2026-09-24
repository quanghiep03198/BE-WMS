import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { BaseTypeOrmRepository } from '@modules/_base/repositories/base-typeorm.abstract.repository'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { WarehouseEntity } from '../entities/warehouse.entity'

@Injectable()
export class RmdbsWarehouseRepository extends BaseTypeOrmRepository<WarehouseEntity> {
	constructor(
		@InjectRepository(WarehouseEntity, DATA_SOURCE_DATA_LAKE)
		private readonly warehouseRepository: Repository<WarehouseEntity>
	) {
		super(warehouseRepository)
	}

	public async findOneByName(name: string) {
		return await this.warehouseRepository.findOneBy({ name })
	}

	public async updateOneByName({
		prev,
		update
	}: {
		prev: { name: string; capacity: number }
		update: { name: string; capacity: number }
	}) {
		return await this.warehouseRepository.update(
			{ name: prev.name },
			{ ...update, code: () => /* SQL */ `cofactory_code + '${update.name}'` }
		)
	}

	public async deleteManyByNames(names: string[]) {
		await this.warehouseRepository.delete({ name: In(names) })
	}
}
