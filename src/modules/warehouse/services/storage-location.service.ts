import { DataSources } from '@/common/constants/global.enum'
import { BaseAbstractService } from '@/modules/_base/base.abstract.service'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { StorageLocationEntity } from '../entities/storage-location.entity'

@Injectable()
export class StorageLocationService extends BaseAbstractService<StorageLocationEntity> {
	constructor(
		@InjectRepository(StorageLocationEntity, DataSources.DATALAKE)
		private storageLocationRepository: Repository<StorageLocationEntity>
	) {
		super(storageLocationRepository)
	}

	async findAllByWarehouse(warehouseCode: string) {
		return await this.storageLocationRepository.findOneBy({ warehouse_num: warehouseCode })
	}

	async deleteMany(ids: Array<number>) {
		return await this.storageLocationRepository.delete({ keyid: In(ids) })
	}
}
