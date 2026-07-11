import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
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
import { RFIDInboundService } from './application/services/rfid-inbound.service'
import { RFIDOutboundService } from './application/services/rfid-outbound.service'
import { RFIDSharedService } from './application/services/rfid-shared.service'
import { InoutboundEventHandlers } from './domain/events'
import {
	IMPORT_DATA_QUEUE,
	POST_DATA_INBOUND_QUEUE,
	POST_DATA_OUTBOUND_QUEUE,
	ROLLBACK_EXCHANGE_MO_TX_QUEUE,
	ROLLBACK_STOCK_TX_QUEUE
} from './infrastructure/constants/queue'
import { InoutboundMongoRepository } from './infrastructure/persistence/mongodb/repositories/io-mongo.repository'
import {
	EPC_INBOUND_COLLECTION,
	EPC_OUTBOUND_COLLECTION,
	EpcInbound,
	EpcInboundSchema,
	EpcOutbound,
	EpcOutboundSchema,
	FINISHED_GOODS_EPCS,
	FinishedGoodsEpc,
	FinishedGoodsEpcModel,
	FinishedGoodsEpcSchema
} from './infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import {
	RFIDInventoryBackupEntity,
	RFIDInventoryEntity
} from './infrastructure/persistence/mssql/entities/rfid-inventory.entity'
import { RFIDMatchEntity } from './infrastructure/persistence/mssql/entities/rfid-match.entity'
import { InoutboundMssqlRepository } from './infrastructure/persistence/mssql/repositories/io-mssql.repository'
import { RFIDInventoryEntitySubscriber } from './infrastructure/persistence/mssql/subscribers/rfid-inventory.entity.subscriber'
import { RFIDCustomerEntitySubscriber } from './infrastructure/persistence/mssql/subscribers/rfid-match.entity.subscriber'
import { RFIDConsumers } from './infrastructure/queues'
import { RFIDControllers } from './presentation/controllers'
import { InoutboundGateway } from './presentation/gateways/inoutbound.gateway'
import { RFIDListeners } from './presentation/listeners'

@Module({
	imports: [
		TenancyModule,
		ThirdPartyApiModule,
		InventoryModule,
		BullModule.registerQueue({ name: POST_DATA_INBOUND_QUEUE }),
		BullModule.registerQueue({ name: POST_DATA_OUTBOUND_QUEUE }),
		BullModule.registerQueue({ name: IMPORT_DATA_QUEUE }),
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
					collection: FINISHED_GOODS_EPCS,
					useFactory: () => {
						FinishedGoodsEpcSchema.index({ created_at: 1 }, { expires: '365d' })
						FinishedGoodsEpcSchema.index({ epc: 1 }, { unique: true })
						FinishedGoodsEpcSchema.index(
							{
								scannable: 1,
								deleted: 1,
								inbound_device_sn: 1,
								inbound_at: 1,
								last_scanned_at: -1,
								epc: 1,
								mo_no: 1
							},
							{ name: 'idx_inventory_epc_inbound_scan_page' }
						)
						FinishedGoodsEpcSchema.index(
							{
								scannable: 1,
								deleted: 1,
								outbound_device_sn: 1,
								outbound_at: 1,
								po: 1,
								last_scanned_at: -1,
								epc: 1,
								mo_no: 1
							},
							{ name: 'idx_inventory_epc_outbound_scan_page' }
						)
						FinishedGoodsEpcSchema.index(
							{
								scannable: 1,
								deleted: 1,
								mo_no: 1,
								last_scanned_at: -1,
								epc: 1
							},
							{ name: 'idx_inventory_epc_mo_scan_page' }
						)
						FinishedGoodsEpcSchema.index({
							mo_no: 1,
							po: 1,
							size_numcode: 1,
							factory_shoes_style: 1,
							color_sn: 1,
							created_at: -1
						})
						FinishedGoodsEpcSchema.index({ inbound_device_sn: 1, created_at: -1 })
						FinishedGoodsEpcSchema.index({ outbound_device_sn: 1, created_at: -1 })
						FinishedGoodsEpcSchema.plugin(MongoosePaginatePlugin)
						FinishedGoodsEpcSchema.plugin(MongooseDeletePlugin, {
							overrideMethods: true,
							indexFields: ['deleted']
						})

						return FinishedGoodsEpcSchema
					}
				},
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
			],
			DATA_WAREHOUSE_CONNECTION
		)
	],
	controllers: RFIDControllers,
	providers: [
		RFIDSharedService,
		RFIDInboundService,
		RFIDOutboundService,
		{
			provide: IO_MSSQL_REPOSITORY,
			useClass: InoutboundMssqlRepository
		},
		{
			provide: IO_MONGO_REPOSITORY,
			useClass: InoutboundMongoRepository
		},
		...RFIDConsumers,
		...RFIDListeners,
		...InoutboundQueryHandlers,
		...InoutboundCommandHandlers,
		...InoutboundEventHandlers,
		...InoutboundSagas,
		InoutboundGateway,
		RFIDCustomerEntitySubscriber,
		RFIDInventoryEntitySubscriber
	],
	exports: [MongooseModule, RFIDInboundService, InoutboundGateway]
})
export class FinishedGoodsModule implements OnModuleInit {
	constructor(
		private readonly logger: PinoLogger,
		@InjectRedisClient() private readonly redisClient: Redis,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	async onModuleInit() {
		try {
			await this.finishedGoodsEpcModel.syncIndexes()
			this.redisClient.setnx('cached:rfid:enable_deduplicate_inbound_epc', JSON.stringify({ value: true }))
		} catch (error) {
			this.logger.error(error)
		}
	}
}
