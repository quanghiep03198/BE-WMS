import env from '@/common/utils/env.util'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { BullModule } from '@nestjs/bullmq'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { THIRD_PARTY_API_SYNC } from '../third-party-api/constants'
import { ThirdPartyApiModule } from '../third-party-api/third-party-api.module'
import queues from './constants/queues'
import { FPInventoryEntity } from './entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDReaderEntity } from './entities/rfid-reader.entity'
import { RFIDController } from './rfid.controller'
import { FPIRespository } from './rfid.repository'
import { RFIDService } from './rfid.service'
import { FPInventoryEntitySubscriber } from './subscribers/fp-inventory.entity.subscriber'
import { RFIDCustomerEntitySubscriber } from './subscribers/rfid-customer.entity.subscriber'

@Module({
	imports: [
		TenancyModule,
		ThirdPartyApiModule,
		TypeOrmModule.forFeature([FPInventoryEntity, RFIDMatchCustomerEntity, RFIDReaderEntity], DATA_SOURCE_DATA_LAKE),
		BullModule.registerQueue(
			...queues
				.filter((queue) => {
					if (env<RuntimeEnvironment>('NODE_ENV') === 'development') return true
					else return queue.tenant === env('HOST')
				})
				.map(({ name }) => ({ name }))
		),
		BullModule.registerQueue({ name: THIRD_PARTY_API_SYNC })
	],
	controllers: [RFIDController],
	providers: [
		RFIDService,
		FPIRespository,
		RFIDCustomerEntitySubscriber,
		FPInventoryEntitySubscriber,
		...queues.map(({ consumer }) => consumer)
	],
	exports: [FPIRespository]
})
export class RFIDModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(TenacyMiddleware)
			.exclude(
				{ path: '/rfid/search-exchangable-order', method: RequestMethod.GET },
				{ path: '/rfid/post-data/:tenantId', method: RequestMethod.POST }
			)
			.forRoutes({ path: '/rfid/*', method: RequestMethod.ALL })
	}
}
