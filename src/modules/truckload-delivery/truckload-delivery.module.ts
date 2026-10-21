import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { OrderModule } from '@modules/order/order.module'
import { UserModule } from '@modules/user/user.module'
import { BullModule } from '@nestjs/bullmq'
import { Module, OnModuleInit } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TruckloadDeliveryCommandHandlers } from './application/commands'
import { CAR_LICENSE_PLATE_REPOSITORY } from './application/ports/car-license-plate.repository.port'
import { SIGNATURE_STORAGE } from './application/ports/signature-storage.port'
import { TRUCKLOAD_DELIVERY_REPOSITORY } from './application/ports/truckload-delivery.repository.port'
import { RMDBS_TRUCKLOAD_DELIVERY_REPOSITORY } from './application/ports/truckload-delivery.rmdbs.repository.port'
import { TruckloadDeliveryQueryHandlers } from './application/queries'
import { TruckloadDeliverySaga } from './application/sagas/truckload-delivery.saga'
import { TruckloadDeliveryCdcHandlers } from './infrastructure/cdc'
import { TruckloadDeliveryRepository } from './infrastructure/persistence/mongodb/repositories/truckload-delivery.repository'
import {
	TRUCKLOAD_DELIVERY_COLLECTION,
	TruckloadDelivery,
	TruckloadDeliverySchema
} from './infrastructure/persistence/mongodb/schemas/truckload-delivery.schema'
import { SignatureStorage } from './infrastructure/persistence/mongodb/services/signature-storage.service'
import { CarLicenseSnapshotEntity } from './infrastructure/persistence/mssql/entities/car-license.entity'
import { TruckloadDeliveryEntity } from './infrastructure/persistence/mssql/entities/truckload-delivery.entity'
import { CarLicensePlateRepository } from './infrastructure/persistence/mssql/repositories/car-license-plate.repository'
import { RmdbsTruckloadDeliveryRepository } from './infrastructure/persistence/mssql/repositories/rmdbs-truckload-delivery.repository'
import { SYNC_DISPATCH_ORDER_QUEUE, TRUCKLOAD_DELIVERY_JOB_OPTIONS } from './infrastructure/queues'
import { TruckloadDeliveryConsumers } from './infrastructure/queues/consumers'
import { TruckloadDeliveryController } from './presentation/controllers/truckload-delivery.controller'

@Module({
	imports: [
		OrderModule,
		UserModule,
		TypeOrmModule.forFeature([TruckloadDeliveryEntity, CarLicenseSnapshotEntity], DATA_SOURCE_DATA_LAKE),
		BullModule.registerQueue({
			name: SYNC_DISPATCH_ORDER_QUEUE,
			defaultJobOptions: TRUCKLOAD_DELIVERY_JOB_OPTIONS
		}),
		MongooseModule.forFeature(
			[
				{
					name: TruckloadDelivery.name,
					collection: TRUCKLOAD_DELIVERY_COLLECTION,
					schema: TruckloadDeliverySchema
				}
			],
			DATA_WAREHOUSE_CONNECTION
		)
	],
	providers: [
		...TruckloadDeliveryCommandHandlers,
		...TruckloadDeliveryQueryHandlers,
		...TruckloadDeliveryConsumers,
		...TruckloadDeliveryCdcHandlers,
		{ provide: SIGNATURE_STORAGE, useClass: SignatureStorage },
		{ provide: TRUCKLOAD_DELIVERY_REPOSITORY, useClass: TruckloadDeliveryRepository },
		{ provide: RMDBS_TRUCKLOAD_DELIVERY_REPOSITORY, useClass: RmdbsTruckloadDeliveryRepository },
		{ provide: CAR_LICENSE_PLATE_REPOSITORY, useClass: CarLicensePlateRepository },
		TruckloadDeliverySaga
		// SyncLicensePlateTask,
	],
	controllers: [TruckloadDeliveryController]
})
export class TruckloadDeliveryModule implements OnModuleInit {
	constructor(
		@InjectModel(TruckloadDelivery.name, DATA_WAREHOUSE_CONNECTION) private readonly truckloadDeliveryModel
	) {}

	async onModuleInit() {
		await this.truckloadDeliveryModel.syncIndexes()
	}
}
