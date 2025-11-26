import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OtpModule } from '../otp/otp.module'
import { TruckloadDeliveryEntity } from './entities/truckload-delivery.entity'
import { TruckloadDeliveryController } from './truckload-delivery.controller'
import { TruckloadDeliveryService } from './truckload-delivery.service'

@Module({
	imports: [OtpModule, TypeOrmModule.forFeature([TruckloadDeliveryEntity], DATA_SOURCE_DATA_LAKE)],
	providers: [TruckloadDeliveryService],
	controllers: [TruckloadDeliveryController]
})
export class TruckloadDeliveryModule {}
