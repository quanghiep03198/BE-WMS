import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { BullModule } from '@nestjs/bullmq'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Module, OnModuleInit } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import MongooseDeletePlugin from 'mongoose-delete'
import MongoosePaginatePlugin from 'mongoose-paginate-v2'
import { PinoLogger } from 'nestjs-pino'
import { InventoryModule } from '../inventory/inventory.module'
import { RFIDDeviceEntity } from '../rfid-device/entities/rfid-device.entity'
import { TenancyModule } from '../tenancy/tenancy.module'
import { ThirdPartyApiModule } from '../third-party-api/third-party-api.module'
import { InoutboundCommandHandlers } from './application/commands'
import { InoutboundQueryHandlers } from './application/queries'
import { InoutboundSagas } from './application/sagas'
import { RFIDInboundService } from './application/services/rfid-inbound.service'
import { RFIDOutboundService } from './application/services/rfid-outbound.service'
import { RFIDSharedService } from './application/services/rfid-shared.service'
import { InoutboundEventHandlers } from './domain/events'
import { IO_MONGO_REPOSITORY } from './domain/repositories/io-mongo.repository.interface'
import { IO_MSSQL_REPOSITORY } from './domain/repositories/io-mssql.repository.interface'
import { IMPORT_DATA_QUEUE, POST_DATA_INBOUND_QUEUE, POST_DATA_OUTBOUND_QUEUE } from './infrastructure/constants/queue'
import { InoutboundMongoRepository } from './infrastructure/persistence/mongodb/repositories/io-mongo.repository'
import {
	EPC_INBOUND_COLLECTION,
	EPC_OUTBOUND_COLLECTION,
	EpcInbound,
	EpcInboundSchema,
	EpcOutbound,
	EpcOutboundSchema,
	INVENTORY_EPC_COLLECTION,
	InventoryEpc,
	InventoryEpcModel,
	InventoryEpcSchema
} from './infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
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
		TypeOrmModule.forFeature(
			[RFIDInventoryEntity, RFIDInventoryBackupEntity, RFIDMatchEntity, RFIDDeviceEntity],
			DATA_SOURCE_DATA_LAKE
		),
		MongooseModule.forFeatureAsync([
			{
				name: InventoryEpc.name,
				collection: INVENTORY_EPC_COLLECTION,
				useFactory: () => {
					InventoryEpcSchema.index({ created_at: 1 }, { expires: '365d' })
					InventoryEpcSchema.index({ epc: 1 }, { unique: true })
					InventoryEpcSchema.index({
						mo_no: 1,
						po: 1,
						size_numcode: 1,
						factory_shoes_style: 1,
						color_sn: 1,
						created_at: -1
					})
					InventoryEpcSchema.index({ inbound_device_sn: 1, created_at: -1 })
					InventoryEpcSchema.index({ outbound_device_sn: 1, created_at: -1 })
					InventoryEpcSchema.plugin(MongoosePaginatePlugin)
					InventoryEpcSchema.plugin(MongooseDeletePlugin, {
						overrideMethods: true,
						indexFields: ['deleted']
					})

					return InventoryEpcSchema
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
		])
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
export class InoutboundModule implements OnModuleInit {
	constructor(
		private readonly logger: PinoLogger,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	async onModuleInit() {
		try {
			await Promise.all([
				// this.epcInboundModel.syncIndexes(),
				// this.epcOutboundModel.syncIndexes(),
				this.inventoryEpcModel.syncIndexes()
			])
			// await Promise.all([
			// 	this.cacheManager.set('cached:rfid:inbound_watchers', 0),
			// 	this.cacheManager.set('cached:rfid:outbound_watchers', 0),
			// 	this.cacheManager.set('cached:rfid:enable_deduplicate_inbound_epc', true)
			// ])
		} catch (error) {
			this.logger.error(error)
		}
	}
}
