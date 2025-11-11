import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TruckloadDeliveryEntity } from './entities/truckload-delivery.entity'
import { TruckloadDeliveryController } from './truckload-delivery.controller'
import { DeliveryService } from './truckload-delivery.service'

@Module({
	imports: [TypeOrmModule.forFeature([TruckloadDeliveryEntity], DATA_SOURCE_DATA_LAKE)],
	providers: [DeliveryService],
	controllers: [TruckloadDeliveryController]
})
export class TruckloadDeliveryModule {}
