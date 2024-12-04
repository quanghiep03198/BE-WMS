import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { ThirdPartyApiModule } from '../third-party-api/third-party-api.module'
import { FPInventoryEntity } from './entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { FPInventoryController } from './rfid.controller'
import { FPIRespository } from './rfid.repository'
import { FPInventoryService } from './rfid.service'
import { FPInventoryEntitySubscriber } from './subscribers/fp-inventory.entity.subscriber'
import { RFIDCustomerEntitySubscriber } from './subscribers/rfid-customer.entity.subscriber'

@Module({
	imports: [
		TenancyModule,
		ThirdPartyApiModule,
		TypeOrmModule.forFeature([FPInventoryEntity, RFIDMatchCustomerEntity], DATA_SOURCE_DATA_LAKE)
	],
	controllers: [FPInventoryController],
	providers: [FPInventoryService, FPIRespository, RFIDCustomerEntitySubscriber, FPInventoryEntitySubscriber]
})
export class RFIDModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(TenacyMiddleware)
			.exclude({ path: '/rfid/search-exchangable-order', method: RequestMethod.GET })
			.forRoutes({ path: '/rfid*', method: RequestMethod.ALL })
	}
}
