import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { OrderModule } from '@modules/order/order.module'
import { BullModule } from '@nestjs/bullmq'
import { Module, OnModuleInit } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import { PinoLogger } from 'nestjs-pino'
import { InventoryModule } from '../inventory/inventory.module'
import { RFIDDeviceEntity } from '../rfid-device/entities/rfid-device.entity'
import { TenancyModule } from '../tenancy/tenancy.module'
import { ThirdPartyApiModule } from '../third-party-api/third-party-api.module'
import { FinishedGoodsCommandHandlers } from './application/commands'
import { IO_MONGO_REPOSITORY } from './application/ports/io-mongo.repository.port'
import { IO_MSSQL_REPOSITORY } from './application/ports/io-mssql.repository.port'
import { FinishedGoodsQueryHandlers } from './application/queries'
import { FinishedGoodsSagas } from './application/sagas'
import { FinishedGoodsEventHandlers } from './domain/events'
import { MONGO_EPC_CHANGE_STREAM_FACTORY } from './domain/interfaces/epc-change-stream.factory.interface'
import { MongoEpcChangeStreamFactory } from './infrastructure/persistence/mongodb/epc-change-stream.factory'
import { InoutboundMongoRepository } from './infrastructure/persistence/mongodb/repositories/io-mongo.repository'
import {
	DAILY_MO_INVENTORY_VARIATION_COLLECTION,
	DailyMoInventoryVariation,
	DailyMoInventoryVariationModel,
	DailyMoInventoryVariationSchema
} from './infrastructure/persistence/mongodb/schemas/daily-mo-inventory-variation.schema'
import {
	DAILY_PO_SHIPPING_PROGRESS_COLLECTION,
	DailyPoShippingProgress,
	DailyPoShippingProgressModel,
	DailyPoShippingProgressSchema
} from './infrastructure/persistence/mongodb/schemas/daily-po-shipping-progress.schema'
import {
	FINISHED_GOODS_EPCS_MATCH_COLLECTION,
	FinishedGoodsEpcMatch,
	FinishedGoodsEpcMatchModel,
	FinishedGoodsEpcMatchSchema
} from './infrastructure/persistence/mongodb/schemas/epc-match.schema'
import {
	FINISHED_GOODS_EPCS_COLLECTION,
	FinishedGoodsEpc,
	FinishedGoodsEpcModel,
	FinishedGoodsEpcSchema
} from './infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import {
	MO_INVENTORY_VARIATION_COLLECTION,
	MoInventoryVariation,
	MoInventoryVariationModel,
	MoInventoryVariationSchema
} from './infrastructure/persistence/mongodb/schemas/mo-inventory-variation.schema'
import {
	PO_SHIPPING_PROGRESS_COLLECTION,
	PoShippingProgress,
	PoShippingProgressModel,
	PoShippingProgressSchema
} from './infrastructure/persistence/mongodb/schemas/po-shipping-progress.schema'
import {
	RFIDInventoryBackupEntity,
	RFIDInventoryEntity
} from './infrastructure/persistence/mssql/entities/rfid-inventory.entity'
import { RFIDMatchEntity } from './infrastructure/persistence/mssql/entities/rfid-match.entity'
import { InoutboundMssqlRepository } from './infrastructure/persistence/mssql/repositories/io-mssql.repository'
import { FinishedGoodsEntitySubscribers } from './infrastructure/persistence/mssql/subscribers'
import {
	BULK_WRITE_INBOUND_EPCS_QUEUE,
	BULK_WRITE_OUTBOUND_EPCS_QUEUE,
	COMMIT_EXCHANGE_MO_QUEUE,
	COMMIT_STOCK_OUT_QUEUE,
	COMMIT_STOCK_VARIATION_QUEUE,
	COMMIT_UPSERT_EPC_MATCH_QUEUE,
	IMPORT_INOUTBOUND_EPCS_QUEUE
} from './infrastructure/queues'
import { FinishedGoodsConsumers } from './infrastructure/queues/consumers'
import { FinsishedGoodsQueueEvents } from './infrastructure/queues/events'
import { FinishedGoodsControllers } from './presentation/controllers'
import { FinishedGoodsGateway } from './presentation/gateways/finished-goods.gateway'
import { FinishedGoodsListeners } from './presentation/listeners'

@Module({
	imports: [
		TenancyModule,
		ThirdPartyApiModule,
		InventoryModule,
		OrderModule,
		BullModule.registerQueue({ name: BULK_WRITE_INBOUND_EPCS_QUEUE }),
		BullModule.registerQueue({ name: BULK_WRITE_OUTBOUND_EPCS_QUEUE }),
		BullModule.registerQueue({ name: IMPORT_INOUTBOUND_EPCS_QUEUE }),
		BullModule.registerQueue({
			name: COMMIT_STOCK_VARIATION_QUEUE,
			defaultJobOptions: {
				attempts: 10,
				removeOnComplete: { count: 10 },
				removeOnFail: { count: 100 },
				backoff: { type: 'fixed', delay: 10_000 }
			}
		}),
		BullModule.registerQueue({
			name: COMMIT_STOCK_OUT_QUEUE,
			defaultJobOptions: {
				attempts: 10,
				removeOnComplete: { count: 10 },
				removeOnFail: { count: 100 },
				backoff: { type: 'fixed', delay: 10_000 }
			}
		}),
		BullModule.registerQueue({
			name: COMMIT_EXCHANGE_MO_QUEUE,
			defaultJobOptions: {
				attempts: 10,
				removeOnComplete: { count: 10 },
				removeOnFail: { count: 100 },
				backoff: { type: 'fixed', delay: 3000 }
			}
		}),
		BullModule.registerQueue({
			name: COMMIT_UPSERT_EPC_MATCH_QUEUE,
			defaultJobOptions: {
				attempts: 10,
				removeOnComplete: { count: 10 },
				removeOnFail: { count: 100 },
				backoff: { type: 'fixed', delay: 3000 }
			}
		}),
		TypeOrmModule.forFeature(
			[RFIDInventoryEntity, RFIDInventoryBackupEntity, RFIDMatchEntity, RFIDDeviceEntity],
			DATA_SOURCE_DATA_LAKE
		),
		MongooseModule.forFeature(
			[
				{
					name: FinishedGoodsEpc.name,
					collection: FINISHED_GOODS_EPCS_COLLECTION,
					schema: FinishedGoodsEpcSchema
				},
				{
					name: FinishedGoodsEpcMatch.name,
					collection: FINISHED_GOODS_EPCS_MATCH_COLLECTION,
					schema: FinishedGoodsEpcMatchSchema
				},
				{
					name: MoInventoryVariation.name,
					collection: MO_INVENTORY_VARIATION_COLLECTION,
					schema: MoInventoryVariationSchema
				},
				{
					name: DailyMoInventoryVariation.name,
					collection: DAILY_MO_INVENTORY_VARIATION_COLLECTION,
					schema: DailyMoInventoryVariationSchema
				},
				{
					name: PoShippingProgress.name,
					collection: PO_SHIPPING_PROGRESS_COLLECTION,
					schema: PoShippingProgressSchema
				},
				{
					name: DailyPoShippingProgress.name,
					collection: DAILY_PO_SHIPPING_PROGRESS_COLLECTION,
					schema: DailyPoShippingProgressSchema
				}
			],
			DATA_WAREHOUSE_CONNECTION
		)
	],
	controllers: FinishedGoodsControllers,
	providers: [
		...FinishedGoodsConsumers,
		...FinishedGoodsListeners,
		...FinishedGoodsQueryHandlers,
		...FinishedGoodsCommandHandlers,
		...FinishedGoodsEventHandlers,
		...FinishedGoodsSagas,
		...FinishedGoodsEntitySubscribers,
		...FinsishedGoodsQueueEvents,
		FinishedGoodsGateway,
		{
			provide: MONGO_EPC_CHANGE_STREAM_FACTORY,
			useClass: MongoEpcChangeStreamFactory
		},
		{
			provide: IO_MSSQL_REPOSITORY,
			useClass: InoutboundMssqlRepository
		},
		{
			provide: IO_MONGO_REPOSITORY,
			useClass: InoutboundMongoRepository
		}
	],
	exports: [MongooseModule, FinishedGoodsGateway, IO_MSSQL_REPOSITORY]
})
export class FinishedGoodsModule implements OnModuleInit {
	constructor(
		private readonly logger: PinoLogger,
		@InjectRedisClient() private readonly redisClient: Redis,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectModel(MoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly moInventoryVariationModel: MoInventoryVariationModel,
		@InjectModel(DailyMoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyMoInventoryVariationModel: DailyMoInventoryVariationModel,
		@InjectModel(FinishedGoodsEpcMatch.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcMatchModel: FinishedGoodsEpcMatchModel,
		@InjectModel(PoShippingProgress.name, DATA_WAREHOUSE_CONNECTION)
		private readonly poShippingProgressModel: PoShippingProgressModel,
		@InjectModel(PoShippingProgress.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyPoShippingProgressModel: DailyPoShippingProgressModel
	) {}

	async onModuleInit() {
		try {
			await Promise.all([
				this.finishedGoodsEpcModel.syncIndexes(),
				this.finishedGoodsEpcMatchModel.syncIndexes(),
				this.moInventoryVariationModel.syncIndexes(),
				this.dailyMoInventoryVariationModel.syncIndexes(),
				this.poShippingProgressModel.syncIndexes(),
				this.dailyPoShippingProgressModel.syncIndexes()
			])
			this.redisClient.setnx('cached:rfid:enable_deduplicate_inbound_epc', JSON.stringify({ value: true }))
		} catch (error) {
			this.logger.error(error)
		}
	}
}
