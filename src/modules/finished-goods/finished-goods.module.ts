import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { OrderModule } from '@modules/order/order.module'
import { BullModule } from '@nestjs/bullmq'
import { Module, OnModuleInit } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import MongooseDeletePlugin from 'mongoose-delete'
import MongoosePaginatePlugin from 'mongoose-paginate-v2'
import { PinoLogger } from 'nestjs-pino'
import { InventoryModule } from '../inventory/inventory.module'
import { RFIDDeviceEntity } from '../rfid-device/entities/rfid-device.entity'
import { TenancyModule } from '../tenancy/tenancy.module'
import { ThirdPartyApiModule } from '../third-party-api/third-party-api.module'
import { InoutboundCommandHandlers } from './application/commands'
import { IO_MONGO_REPOSITORY } from './application/ports/io-mongo.repository.port'
import { IO_MSSQL_REPOSITORY } from './application/ports/io-mssql.repository.port'
import { InoutboundQueryHandlers } from './application/queries'
import { InoutboundSagas } from './application/sagas'
import { InoutboundEventHandlers } from './domain/events'
import {
	BULK_WRITE_INBOUND_EPCS_QUEUE,
	BULK_WRITE_OUTBOUND_EPCS_QUEUE,
	IMPORT_INOUTBOUND_EPCS_QUEUE,
	ROLLBACK_EXCHANGE_MO_TX_QUEUE,
	ROLLBACK_STOCK_TX_QUEUE,
	STOCK_IN_QUEUE
} from './infrastructure/constants/queue'
import { InoutboundMongoRepository } from './infrastructure/persistence/mongodb/repositories/io-mongo.repository'
import {
	DAILY_MO_INVENTORY_VARIATION_COLLECTION,
	DailyMoInventoryVariation,
	DailyMoInventoryVariationModel
} from './infrastructure/persistence/mongodb/schemas/daily-mo-inventory-variation.schema'
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
	RFIDInventoryBackupEntity,
	RFIDInventoryEntity
} from './infrastructure/persistence/mssql/entities/rfid-inventory.entity'
import { RFIDMatchEntity } from './infrastructure/persistence/mssql/entities/rfid-match.entity'
import { InoutboundMssqlRepository } from './infrastructure/persistence/mssql/repositories/io-mssql.repository'
import { FinishedGoodsEntitySubscribers } from './infrastructure/persistence/mssql/subscribers'
import { FinishedGoodsConsumers } from './infrastructure/queues'
import { FinishedGoodsControllers } from './presentation/controllers'
import { FinishedGoodsGateway } from './presentation/gateways/inoutbound.gateway'
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
			name: STOCK_IN_QUEUE,
			defaultJobOptions: {
				attempts: 10,
				removeOnComplete: { count: 10 },
				removeOnFail: { count: 100 },
				backoff: { type: 'fixed', delay: 10_000 }
			}
		}),
		BullModule.registerQueue({
			name: ROLLBACK_EXCHANGE_MO_TX_QUEUE,
			defaultJobOptions: {
				attempts: 5,
				removeOnComplete: { count: 10 },
				removeOnFail: { count: 100 },
				backoff: { type: 'fixed', delay: 3000 }
			}
		}),
		BullModule.registerQueue({
			name: ROLLBACK_STOCK_TX_QUEUE,
			defaultJobOptions: {
				attempts: 5,
				removeOnComplete: { count: 10 },
				removeOnFail: { count: 100 },
				backoff: { type: 'fixed', delay: 3000 }
			}
		}),
		TypeOrmModule.forFeature(
			[RFIDInventoryEntity, RFIDInventoryBackupEntity, RFIDMatchEntity, RFIDDeviceEntity],
			DATA_SOURCE_DATA_LAKE
		),
		MongooseModule.forFeatureAsync(
			[
				{
					name: FinishedGoodsEpc.name,
					collection: FINISHED_GOODS_EPCS_COLLECTION,
					useFactory: () => {
						// FinishedGoodsEpcSchema.index({ outbound_at: 1 }, { expires: '60d', name: 'idx_outbound_at' })
						// * Indexes
						FinishedGoodsEpcSchema.index({ epc: 1 }, { unique: true, name: 'idx_epc' })
						FinishedGoodsEpcSchema.index(
							{ scannable: 1, deleted: 1, inbound_device_sn: 1, inbound_at: 1, storage_location: 1 },
							{ name: 'idx_inbound_active' }
						)
						FinishedGoodsEpcSchema.index(
							{
								scannable: 1,
								deleted: 1,
								outbound_at: 1,
								outbound_device_sn: 1,
								inbound_at: 1,
								storage_location: 1
							},
							{
								name: 'idx_outbound_active'
							}
						)
						FinishedGoodsEpcSchema.index(
							{ scannable: 1, deleted: 1, mo_no: 1, factory_shoes_style: 1, size_numcode: 1 },
							{ name: 'idx_group_mo_style_size' }
						)
						FinishedGoodsEpcSchema.index(
							{ scannable: 1, deleted: 1, mo_no: 1, factory_shoes_style: 1, color_sn: 1, size_numcode: 1 },
							{ name: 'idx_specs_inbound', partialFilterExpression: { inbound_at: null } }
						)
						FinishedGoodsEpcSchema.index(
							{ scannable: 1, deleted: 1, mo_no: 1, factory_shoes_style: 1, color_sn: 1, size_numcode: 1 },
							{
								name: 'idx_specs_outbound',
								partialFilterExpression: {
									inbound_at: { $gt: new Date(2024, 0, 1) },
									outbound_at: null
								}
							}
						)

						// * Addon plugins
						FinishedGoodsEpcSchema.plugin(MongoosePaginatePlugin)

						FinishedGoodsEpcSchema.plugin(MongooseDeletePlugin, {
							overrideMethods: true
						})

						return FinishedGoodsEpcSchema
					}
				},
				{
					name: MoInventoryVariation.name,
					collection: MO_INVENTORY_VARIATION_COLLECTION,
					useFactory: () => {
						MoInventoryVariationSchema.index({ mo_no: 1 }, { name: 'idx_mo', unique: true })
						return MoInventoryVariationSchema
					}
				},
				{
					name: DailyMoInventoryVariation.name,
					collection: DAILY_MO_INVENTORY_VARIATION_COLLECTION,
					useFactory: () => {
						MoInventoryVariationSchema.index({ date: 1, mo_no: 1 }, { name: 'idx_date_mo', unique: true })
						return MoInventoryVariationSchema
					}
				}
			],
			DATA_WAREHOUSE_CONNECTION
		)
	],
	controllers: FinishedGoodsControllers,
	providers: [
		...FinishedGoodsConsumers,
		...FinishedGoodsListeners,
		...InoutboundQueryHandlers,
		...InoutboundCommandHandlers,
		...InoutboundEventHandlers,
		...InoutboundSagas,
		...FinishedGoodsEntitySubscribers,
		FinishedGoodsGateway,
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
		private readonly moInventoryVariation: MoInventoryVariationModel,
		@InjectModel(DailyMoInventoryVariation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly dailyMoInventoryVariation: DailyMoInventoryVariationModel
	) {}

	async onModuleInit() {
		try {
			await this.finishedGoodsEpcModel.syncIndexes()
			await this.moInventoryVariation.syncIndexes()
			await this.dailyMoInventoryVariation.syncIndexes()
			this.redisClient.setnx('cached:rfid:enable_deduplicate_inbound_epc', JSON.stringify({ value: true }))
		} catch (error) {
			this.logger.error(error)
		}
	}
}
