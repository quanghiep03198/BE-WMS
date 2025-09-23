import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { BullModule } from '@nestjs/bullmq'
import { MiddlewareConsumer, Module, NestModule, OnModuleInit, RequestMethod } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import MongooseDeletePlugin from 'mongoose-delete'
import MongoosePaginatePlugin from 'mongoose-paginate-v2'
import { PinoLogger } from 'nestjs-pino'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { ThirdPartyApiModule } from '../third-party-api/third-party-api.module'
import { IMPORT_DATA_QUEUE, POST_DATA_INBOUND_QUEUE, POST_DATA_OUTBOUND_QUEUE } from './constants'
import { RFIDInboundController } from './controllers/rfid-inbound.controller'
import { RFIDOutboundController } from './controllers/rfid-outbound.controller'
import { RFIDSharedController } from './controllers/rfid-shared.controller'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDReaderEntity } from './entities/rfid-reader.entity'
import { RFIDInventoryBackupEntity, RFIDInventoryEntity } from './entities/rifd-inventory.entity'
import { RFIDImportDataConsumer } from './queues/rfid-import-data.consumer'
import { RFIDInboundConsumer } from './queues/rfid-inbound.consumer'
import { RFIDOutboundConsumer } from './queues/rfid-outbound.consumer'
import {
	EPC_INBOUND_COLLECTION,
	EPC_OUTBOUND_COLLECTION,
	EpcInbound,
	EpcInboundSchema,
	EpcModel,
	EpcOutbound,
	EpcOutboundSchema
} from './schemas/epc.schema'
import { RFIDInboundService } from './services/rfid-inbound.service'
import { RFIDOutboundService } from './services/rfid-outbound.service'
import { RFIDReaderService } from './services/rfid-reader.service'
import { RFIDSharedService } from './services/rfid-shared.service'
import { FPInventoryEntitySubscriber } from './subscribers/fp-inventory.entity.subscriber'
import { RFIDCustomerEntitySubscriber } from './subscribers/rfid-customer.entity.subscriber'

@Module({
	imports: [
		TenancyModule,
		ThirdPartyApiModule,
		BullModule.registerQueue({ name: POST_DATA_INBOUND_QUEUE }),
		BullModule.registerQueue({ name: POST_DATA_OUTBOUND_QUEUE }),
		BullModule.registerQueue({ name: IMPORT_DATA_QUEUE }),
		TypeOrmModule.forFeature(
			[RFIDInventoryEntity, RFIDInventoryBackupEntity, RFIDMatchCustomerEntity, RFIDReaderEntity],
			DATA_SOURCE_DATA_LAKE
		),
		MongooseModule.forFeatureAsync([
			{
				name: EpcInbound.name,
				collection: EPC_INBOUND_COLLECTION,
				useFactory: () => {
					EpcInboundSchema.index({ record_time: 1 }, { expires: '365d' })
					EpcInboundSchema.index({ mo_no: 1, size_numcode: 1, factory_shoes_style: 1, color_sn: 1 })
					EpcInboundSchema.plugin(MongoosePaginatePlugin)
					EpcInboundSchema.plugin(MongooseDeletePlugin, {
						overrideMethods: true,
						indexFields: ['deleted']
					})
					return EpcInboundSchema
				}
			},
			{
				name: EpcOutbound.name,
				collection: EPC_OUTBOUND_COLLECTION,
				useFactory: () => {
					EpcOutboundSchema.index({ record_time: 1 }, { expires: '365d' })
					EpcOutboundSchema.index({ mo_no: 1, size_numcode: 1, factory_shoes_style: 1, color_sn: 1 })
					EpcOutboundSchema.index({ po: 1 })
					EpcOutboundSchema.plugin(MongoosePaginatePlugin)
					EpcOutboundSchema.plugin(MongooseDeletePlugin, {
						overrideMethods: true,
						indexFields: ['deleted']
					})
					return EpcOutboundSchema
				}
			}
		])
	],
	controllers: [RFIDSharedController, RFIDInboundController, RFIDOutboundController],
	providers: [
		RFIDSharedService,
		RFIDReaderService,
		RFIDInboundService,
		RFIDOutboundService,
		RFIDInboundConsumer,
		RFIDOutboundConsumer,
		RFIDImportDataConsumer,
		RFIDCustomerEntitySubscriber,
		FPInventoryEntitySubscriber
	],
	exports: [MongooseModule, RFIDInboundService]
})
export class RFIDModule implements NestModule, OnModuleInit {
	constructor(
		private readonly logger: PinoLogger,
		@InjectModel(EpcInbound.name) private readonly epcInboundModel: EpcModel,
		@InjectModel(EpcOutbound.name) private readonly epcOutboundModel: EpcModel
	) {}

	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(TenacyMiddleware)
			.forRoutes({ path: '/rfid/inbound/update-stock/:orderCode', method: RequestMethod.PUT })
	}

	async onModuleInit() {
		try {
			await Promise.all([this.epcInboundModel.syncIndexes(), this.epcOutboundModel.syncIndexes()])
		} catch (error) {
			this.logger.error(error)
		}
	}
}
