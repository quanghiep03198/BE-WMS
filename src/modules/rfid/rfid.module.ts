import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { ThirdPartyApiModule } from '../third-party-api/third-party.module'
import { RFIDCustomerEntity } from './entities/rfid-customer.entity'
import { RFIDInventoryEntity } from './entities/rfid-inventory.entity'
import { RFIDController } from './rfid.controller'
import { RFIDRepository } from './rfid.repository'
import { RFIDService } from './rfid.service'

@Module({
	imports: [
		TenancyModule,
		ThirdPartyApiModule,
		TypeOrmModule.forFeature([RFIDInventoryEntity, RFIDCustomerEntity], DATASOURCE_DATA_LAKE)
	],
	controllers: [RFIDController],
	providers: [RFIDService, RFIDRepository]
})
export class RFIDModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes({ path: '/rfid*', method: RequestMethod.ALL })
	}
}
