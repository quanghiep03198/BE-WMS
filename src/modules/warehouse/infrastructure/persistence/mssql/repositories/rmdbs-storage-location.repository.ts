import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { BaseTypeOrmRepository } from '@modules/_base/repositories/base-typeorm.abstract.repository'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Repository } from 'typeorm'
import { StorageLocationEntity } from '../entities/storage-location.entity'

@Injectable()
export class RmdbsStorageLocationRepository extends BaseTypeOrmRepository<StorageLocationEntity> {
	constructor(
		@InjectRepository(StorageLocationEntity, DATA_SOURCE_DATA_LAKE)
		public readonly storageLocationRepository: Repository<StorageLocationEntity>,
		@InjectPinoLogger(RmdbsStorageLocationRepository.name)
		private readonly logger: PinoLogger
	) {
		super(storageLocationRepository)
	}

	public async updateOneByName({ prev, update }: { prev: { name: string }; update: { name: string } }) {
		const storageLocation = await this.storageLocationRepository.findOne({
			where: { name: prev.name },
			relations: { warehouse: true }
		})

		this.logger.debug(storageLocation)

		if (!storageLocation?.warehouse) return

		return await this.storageLocationRepository.update(
			{ name: prev.name },
			{
				name: update.name,
				code: () => /* SQL */ `CONCAT(cofactory_code , '${storageLocation.warehouse.name}' , '${update.name}')`
			}
		)
	}

	public async deleteManyByNames(names: string[]) {
		await this.storageLocationRepository.delete(names.map((name) => ({ name })))
	}
}
