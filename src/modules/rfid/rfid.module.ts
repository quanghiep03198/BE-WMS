import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { ThirdPartyApiModule } from '../third-party-api/third-party-api.module'
import { FPInventoryController } from './controllers/fp-inventory.controller'
import { FPInventoryEntity } from './entities/fp-inventory.entity'
import { RFIDCustomerEntity } from './entities/rfid-customer.entity'
import { FPInventoryRepository } from './repositories/fp-inventory.repository'
import { FPIService } from './services/fp-inventory.service'

@Module({
	imports: [
		TenancyModule,
		ThirdPartyApiModule,
		TypeOrmModule.forFeature([FPInventoryEntity, RFIDCustomerEntity], DATA_SOURCE_DATA_LAKE)
	],
	controllers: [FPInventoryController],
	providers: [FPIService, FPInventoryRepository]
})
export class RFIDModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes({ path: '/rfid*', method: RequestMethod.ALL })
	}
}
