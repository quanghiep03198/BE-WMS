import { DataSources } from '@/common/constants/global.enum'
import { BaseAbstractService } from '@/modules/_base/base.abstract.service'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { WarehouseEntity } from '../entities/warehouse.entity'

@Injectable()
export class WarehouseService extends BaseAbstractService<WarehouseEntity> {
	constructor(
		@InjectRepository(WarehouseEntity, DataSources.DATALAKE)
		private warehouseRepository: Repository<WarehouseEntity>
	) {
		super(warehouseRepository)
	}

	async findAllByFactory(cofactoryCode: string) {
		return await this.warehouseRepository.findBy({ cofactory_code: cofactoryCode })
	}

	async deleteMany(ids: Array<number>) {
		return await this.warehouseRepository.delete({ id: In(ids) })
	}
}
