import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractService } from '@/modules/_base/base.abstract.service'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { WarehouseEntity } from '../entities/warehouse.entity'

@Injectable()
export class WarehouseService extends BaseAbstractService<WarehouseEntity> {
	constructor(
		@InjectRepository(WarehouseEntity, DATASOURCE_DATA_LAKE)
		private warehouseRepository: Repository<WarehouseEntity>
	) {
		super(warehouseRepository)
	}
	async findAllByFactory(cofactoryCode: string) {
		return await this.warehouseRepository
			.createQueryBuilder('warehouse')
			.leftJoinAndSelect('warehouse.storage_locations', 'storage')
			.select(['warehouse', 'storage.id', 'storage.storage_num', 'storage.storage_name'])
			.where('warehouse.cofactory_code = :cofactoryCode', { cofactoryCode: cofactoryCode })
			.getMany()
	}

	async findOneByWarehouseCode(warehouseCode: string) {
		return await this.warehouseRepository.findOne({
			where: { warehouse_num: warehouseCode },
			relations: { storage_locations: true }
		})
	}

	async deleteMany(ids: Array<number>) {
		return await this.warehouseRepository.delete({ id: In(ids) })
	}
}
