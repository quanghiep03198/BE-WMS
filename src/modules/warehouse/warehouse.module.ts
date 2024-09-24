import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { StorageLocationController } from './controllers/storage-location.controller'
import { WarehouseController } from './controllers/warehouse.controller'
import { StorageLocationEntity } from './entities/storage-location.entity'
import { WarehouseEntity } from './entities/warehouse.entity'
import { StorageLocationService } from './services/storage-location.service'
import { WarehouseService } from './services/warehouse.service'
import { StorageLocationSubscriber } from './subscribers/storage-location.entity.subscriber'
import { WarehouseSubscriber } from './subscribers/warehouse.entity.subscriber'

@Module({
	imports: [TypeOrmModule.forFeature([WarehouseEntity, StorageLocationEntity], DATASOURCE_DATA_LAKE)],
	controllers: [WarehouseController, StorageLocationController],
	providers: [WarehouseService, WarehouseSubscriber, StorageLocationService, StorageLocationSubscriber]
})
export class WarehouseModule {}
