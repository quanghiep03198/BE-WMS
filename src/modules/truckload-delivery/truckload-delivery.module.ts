import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CarLicenseSnapshotEntity } from './entities/car-license.entity'
import { TruckloadDeliveryEntity } from './entities/truckload-delivery.entity'
import { TruckloadDeliveryCdcHandler } from './truckload-delivery.cdc'
import { TruckloadDeliveryController } from './truckload-delivery.controller'
import { TruckloadDeliveryService } from './truckload-delivery.service'

@Module({
	imports: [TypeOrmModule.forFeature([TruckloadDeliveryEntity, CarLicenseSnapshotEntity], DATA_SOURCE_DATA_LAKE)],
	providers: [TruckloadDeliveryService, TruckloadDeliveryCdcHandler],
	controllers: [TruckloadDeliveryController]
})
export class TruckloadDeliveryModule {}
