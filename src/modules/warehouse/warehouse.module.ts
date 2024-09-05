import { DataSources } from '@/common/constants/global.enum'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { StorageLocationController } from './controllers/storage-location.controller'
import { WarehouseController } from './controllers/warehouse.controller'
import { StorageLocationEntity } from './entities/storage-location.entity'
import { StorageLocationSubscriber } from './entities/subscribers/storage-location.entity.subscriber'
import { WarehouseSubscriber } from './entities/subscribers/warehouse.entity.subscriber'
import { WarehouseEntity } from './entities/warehouse.entity'
import { StorageLocationService } from './services/storage-location.service'
import { WarehouseService } from './services/warehouse.service'

@Module({
	imports: [TypeOrmModule.forFeature([WarehouseEntity, StorageLocationEntity], DataSources.DATALAKE)],
	controllers: [WarehouseController, StorageLocationController],
	providers: [WarehouseService, WarehouseSubscriber, StorageLocationService, StorageLocationSubscriber]
})
export class WarehouseModule {}
