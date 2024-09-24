import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractService } from '@/modules/_base/base.abstract.service'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { StorageLocationEntity } from '../entities/storage-location.entity'

@Injectable()
export class StorageLocationService extends BaseAbstractService<StorageLocationEntity> {
	constructor(
		@InjectRepository(StorageLocationEntity, DATASOURCE_DATA_LAKE)
		private storageLocationRepository: Repository<StorageLocationEntity>
	) {
		super(storageLocationRepository)
	}

	async findByWarehouse(warehouseCode: string) {
		return await this.storageLocationRepository.findBy({ warehouse_num: warehouseCode })
	}

	async deleteMany(id: Array<number>) {
		return await this.storageLocationRepository.delete({ id: In(id) })
	}
}
