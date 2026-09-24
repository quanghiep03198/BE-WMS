import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { UserModule } from '@modules/user/user.module'
import { Module, OnModuleInit } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { STORAGE_LOCATION_REPOSITORY } from './application/ports/storage-location.repository.port'
import { WAREHOUSE_REPOSITORY } from './application/ports/warehouse.repository.port'
import { StorageLocationCdcHandler } from './infrastructure/cdc/storage-location.cdc'
import { WarehouseCdcHandler } from './infrastructure/cdc/warehouse.cdc'
import { WarehouseListeners } from './infrastructure/listeners'
import { StorageLocationRepository } from './infrastructure/persistence/mongodb/repositories/storage-location.repository'
import { WarehouseRepository } from './infrastructure/persistence/mongodb/repositories/warehouse.repository'
import {
	STORAGE_LOCATION_COLLECTION,
	StorageLocation,
	StorageLocationModel,
	StorageLocationSchema
} from './infrastructure/persistence/mongodb/schemas/storage-location.schema'
import {
	Warehouse,
	WAREHOUSE_COLLECTION,
	WarehouseModel,
	WarehouseSchema
} from './infrastructure/persistence/mongodb/schemas/warehouse.schema'
import { StorageLocationEntity } from './infrastructure/persistence/mssql/entities/storage-location.entity'
import { WarehouseEntity } from './infrastructure/persistence/mssql/entities/warehouse.entity'
import { RmdbsStorageLocationRepository } from './infrastructure/persistence/mssql/repositories/rmdbs-storage-location.repository'
import { RmdbsWarehouseRepository } from './infrastructure/persistence/mssql/repositories/rmdbs-warehouse.repository'
import { StorageLocationController } from './presentation/controllers/storage-location.controller'
import { WarehouseController } from './presentation/controllers/warehouse.controller'

@Module({
	imports: [
		UserModule,
		TypeOrmModule.forFeature([WarehouseEntity, StorageLocationEntity], DATA_SOURCE_DATA_LAKE),
		MongooseModule.forFeature(
			[
				{ name: Warehouse.name, collection: WAREHOUSE_COLLECTION, schema: WarehouseSchema },
				{ name: StorageLocation.name, collection: STORAGE_LOCATION_COLLECTION, schema: StorageLocationSchema }
			],
			DATA_WAREHOUSE_CONNECTION
		)
	],
	controllers: [WarehouseController, StorageLocationController],
	providers: [
		...WarehouseListeners,
		{ provide: WAREHOUSE_REPOSITORY, useClass: WarehouseRepository },
		{ provide: STORAGE_LOCATION_REPOSITORY, useClass: StorageLocationRepository },
		RmdbsWarehouseRepository,
		RmdbsStorageLocationRepository,
		WarehouseCdcHandler,
		StorageLocationCdcHandler
		// StorageLocationSubscriber
	]
})
export class WarehouseModule implements OnModuleInit {
	constructor(
		@InjectModel(Warehouse.name, DATA_WAREHOUSE_CONNECTION)
		private readonly warehouseModel: WarehouseModel,
		@InjectModel(StorageLocation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly storageLocationModel: StorageLocationModel
	) {}

	async onModuleInit() {
		await this.warehouseModel.syncIndexes()
		await this.storageLocationModel.syncIndexes()
	}
}
