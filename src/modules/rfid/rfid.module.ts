import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { BullModule } from '@nestjs/bullmq'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import MongooseDeletePlugin from 'mongoose-delete'
import MongoosePaginatePlugin from 'mongoose-paginate-v2'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { THIRD_PARTY_API_SYNC } from '../third-party-api/constants'
import { ThirdPartyApiModule } from '../third-party-api/third-party-api.module'
import { POST_DATA_QUEUE } from './constants'
import { FPInventoryEntity } from './entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDReaderEntity } from './entities/rfid-reader.entity'
import { RFIDConsumer } from './rfid.consumer'
import { RFIDController } from './rfid.controller'
import { FPIRespository } from './rfid.repository'
import { RFIDService } from './rfid.service'
import { Epc, EPC_COLLECTION, EpcSchema } from './schemas/epc.schema'
import { FPInventoryEntitySubscriber } from './subscribers/fp-inventory.entity.subscriber'
import { RFIDCustomerEntitySubscriber } from './subscribers/rfid-customer.entity.subscriber'

@Module({
	imports: [
		TenancyModule,
		ThirdPartyApiModule,
		BullModule.registerQueue({ name: POST_DATA_QUEUE }),
		BullModule.registerQueue({ name: THIRD_PARTY_API_SYNC }),
		TypeOrmModule.forFeature([FPInventoryEntity, RFIDMatchCustomerEntity, RFIDReaderEntity], DATA_SOURCE_DATA_LAKE),
		MongooseModule.forFeatureAsync([
			{
				name: Epc.name,
				collection: EPC_COLLECTION,
				useFactory: () => {
					EpcSchema.plugin(MongoosePaginatePlugin)
					EpcSchema.plugin(MongooseDeletePlugin, { overrideMethods: true, indexFields: ['deleted'] })
					return EpcSchema
				}
			}
		])
	],
	controllers: [RFIDController],
	providers: [RFIDService, RFIDConsumer, FPIRespository, RFIDCustomerEntitySubscriber, FPInventoryEntitySubscriber],
	exports: [MongooseModule, FPIRespository]
})
export class RFIDModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(TenacyMiddleware)
			.exclude({ path: '/rfid/post-data/:tenantId', method: RequestMethod.POST })
			.forRoutes({ path: '/rfid/*', method: RequestMethod.ALL })
	}
}
