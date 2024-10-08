import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { RFIDCustomerEntity } from './entities/rfid-customer.entity'
import { RFIDInventoryEntity } from './entities/rfid-inventory.entity'
import { RFIDController } from './rfid.controller'
import { RFIDService } from './rfid.service'

@Module({
	imports: [TenancyModule, TypeOrmModule.forFeature([RFIDInventoryEntity, RFIDCustomerEntity], DATASOURCE_DATA_LAKE)],
	controllers: [RFIDController],
	providers: [RFIDService]
})
export class RFIDModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes({ path: '/rfid*', method: RequestMethod.ALL })
	}
}
