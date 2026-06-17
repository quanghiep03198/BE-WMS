import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { EventGateway } from '@/events/event.gateway'
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
import { RFIDCommandHandlers } from './application/commands'
import { RFIDQueryHandlers } from './application/queries'
import { RFIDInboundService } from './application/services/rfid-inbound.service'
import { RFIDOutboundService } from './application/services/rfid-outbound.service'
import { RFIDSharedService } from './application/services/rfid-shared.service'
import { RFID_REPOSITORY } from './domain/repositories/rfid.repository.interface'
import { IMPORT_DATA_QUEUE, POST_DATA_INBOUND_QUEUE, POST_DATA_OUTBOUND_QUEUE } from './infrastructure/constants/queue'
import {
	EPC_INBOUND_COLLECTION,
	EPC_OUTBOUND_COLLECTION,
	EpcInbound,
	EpcInboundSchema,
	EpcModel,
	EpcOutbound,
	EpcOutboundSchema,
	INVENTORY_EPC_COLLECTION,
	InventoryEpc,
	InventoryEpcModel,
	InventoryEpcSchema
} from './infrastructure/persistence/mongodb/epc.schema'
import { RFIDMatchEntity } from './infrastructure/persistence/mssql/rfid-match.entity'
import {
	RFIDInventoryBackupEntity,
	RFIDInventoryEntity
} from './infrastructure/persistence/mssql/rifd-inventory.entity'
import { FPInventoryEntitySubscriber } from './infrastructure/persistence/mssql/subscribers/rfid-inventory.entity.subscriber'
import { RFIDCustomerEntitySubscriber } from './infrastructure/persistence/mssql/subscribers/rfid-match.entity.subscriber'
import { RFIDImportDataConsumer } from './infrastructure/queues/rfid-import-data.consumer'
import { RFIDInboundConsumer } from './infrastructure/queues/rfid-inbound.consumer'
import { RFIDOutboundConsumer } from './infrastructure/queues/rfid-outbound.consumer'
import { RFIDRepository } from './infrastructure/repositories/rfid.repository'
import { RFIDControllers } from './presentation/controllers'
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
		EventGateway,
		RFIDSharedService,
		RFIDInboundService,
		RFIDOutboundService,
		{
			provide: RFID_REPOSITORY,
			useClass: RFIDRepository
		},

		...RFIDListeners,
		...RFIDQueryHandlers,
		...RFIDCommandHandlers,
		RFIDInboundConsumer,
		RFIDOutboundConsumer,
		RFIDImportDataConsumer,
		RFIDCustomerEntitySubscriber,
		FPInventoryEntitySubscriber
	],
	exports: [MongooseModule, RFIDInboundService]
})
export class RFIDModule implements OnModuleInit {
	constructor(
		private readonly logger: PinoLogger,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectModel(EpcInbound.name) private readonly epcInboundModel: EpcModel,
		@InjectModel(EpcOutbound.name) private readonly epcOutboundModel: EpcModel,
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
