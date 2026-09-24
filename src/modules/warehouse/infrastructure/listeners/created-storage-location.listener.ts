import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import { StorageLocationType } from '@modules/warehouse/domain/constants'
import {
	CREATED_STORAGE_LOCATIONS,
	CreatedStorageLocationsEvent
} from '@modules/warehouse/domain/events/created-storage-locations.event'
import { ConfigService } from '@nestjs/config'
import { RmdbsStorageLocationRepository } from '../persistence/mssql/repositories/rmdbs-storage-location.repository'
import { RmdbsWarehouseRepository } from '../persistence/mssql/repositories/rmdbs-warehouse.repository'

@EventListener(CREATED_STORAGE_LOCATIONS, { async: true })
export class CreatedStorageLocationsListener implements IEventListener<CreatedStorageLocationsEvent, void> {
	constructor(
		private readonly rmdbsStorageLocationRepostory: RmdbsStorageLocationRepository,
		private readonly rmdbsWarehouseRepostory: RmdbsWarehouseRepository,
		private readonly configService: ConfigService<ProcessEnv>
	) {}

	public async handle(event: CreatedStorageLocationsEvent) {
		const factory = this.configService.get<FactoryCode>('APP_TENANCY')

		const warehouse = await this.rmdbsWarehouseRepostory.findOneByName(event.warehouseName)

		console.log('warehouse :>>> ', warehouse)

		await this.rmdbsStorageLocationRepostory.createMany(
			event.locations.map((location) => ({
				name: location.name,
				user_code_created: event.createdBy,
				factory_code: factory,
				code: factory + warehouse.name + location.name,
				warehouse_id: warehouse.id,
				type_storage: StorageLocationType.FINISHED_PRODUCTION_AREA
			}))
		)
	}
}
