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
import { POST_DATA_INBOUND_QUEUE, POST_DATA_OUTBOUND_QUEUE } from './constants'
import { RFIDInboundController } from './controllers/rfid-inbound.controller'
import { RFIDOutboundController } from './controllers/rfid-outbound.controller'
import { RFIDSharedController } from './controllers/rfid-shared.controller'
import { FPInventoryEntity } from './entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDReaderEntity } from './entities/rfid-reader.entity'
import { RFIDInboundConsumer } from './queues/rfid-inbound.consumer'
import {
	EPC_INBOUND_COLLECTION,
	EPC_OUTBOUND_COLLECTION,
	EpcInbound,
	EpcInboundSchema,
	EpcOutbound,
	EpcOutboundSchema
} from './schemas/epc.schema'
import { RFIDInboundService } from './services/rfid-inbound.service'
import { RFIDOutboundService } from './services/rfid-outbound.service'
import { RFIDSharedService } from './services/rfid-shared.service'
import { FPInventoryEntitySubscriber } from './subscribers/fp-inventory.entity.subscriber'
import { RFIDCustomerEntitySubscriber } from './subscribers/rfid-customer.entity.subscriber'

@Module({
	imports: [
		TenancyModule,
		ThirdPartyApiModule,
		BullModule.registerQueue({ name: POST_DATA_INBOUND_QUEUE }),
		BullModule.registerQueue({ name: POST_DATA_OUTBOUND_QUEUE }),
		BullModule.registerQueue({ name: THIRD_PARTY_API_SYNC }),
		TypeOrmModule.forFeature([FPInventoryEntity, RFIDMatchCustomerEntity, RFIDReaderEntity], DATA_SOURCE_DATA_LAKE),
		MongooseModule.forFeatureAsync([
			{
				name: EpcInbound.name,
				collection: EPC_INBOUND_COLLECTION,
				useFactory: () => {
					EpcInboundSchema.plugin(MongoosePaginatePlugin)
					EpcInboundSchema.plugin(MongooseDeletePlugin, { overrideMethods: true, indexFields: ['deleted'] })
					return EpcInboundSchema
				}
			},
			{
				name: EpcOutbound.name,
				collection: EPC_OUTBOUND_COLLECTION,
				useFactory: () => {
					EpcOutboundSchema.plugin(MongoosePaginatePlugin)
					EpcOutboundSchema.plugin(MongooseDeletePlugin, { overrideMethods: true, indexFields: ['deleted'] })
					return EpcOutboundSchema
				}
			}
		])
	],
	controllers: [RFIDSharedController, RFIDInboundController, RFIDOutboundController],
	providers: [
		RFIDSharedService,
		RFIDInboundService,
		RFIDOutboundService,
		RFIDInboundConsumer,
		RFIDCustomerEntitySubscriber,
		FPInventoryEntitySubscriber
	],
	exports: [MongooseModule, RFIDInboundService]
})
export class RFIDModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(TenacyMiddleware)
			.forRoutes({ path: '/rfid/inbound/update-stock/:orderCode', method: RequestMethod.PUT })
	}
}
