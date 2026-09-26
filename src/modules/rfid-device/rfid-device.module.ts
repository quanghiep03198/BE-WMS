import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { Module, OnModuleInit } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RFID_DEVICE_REPOSITORY } from './application/ports/rfid-device.repository.port'
import { RFIDDeviceListeners } from './infrastructure/listeners'
import { RFIDDeviceRepository } from './infrastructure/persistence/mongodb/repositories/rfid-device.repository'
import {
	RFID_DEVICE_COLLECTION,
	RFIDDevice,
	RFIDDeviceModel,
	RFIDDeviceSchema
} from './infrastructure/persistence/mongodb/schemas/rfid-device.schema'
import { RFIDDeviceEntity } from './infrastructure/persistence/mssql/entities/rfid-device.entity'
import { RmdbsRFIDDeviceRepository } from './infrastructure/persistence/mssql/repositories/rmdbs-rfid-device.repository'
import { RFIDDeviceController } from './presentation/controllers/rfid-device.controller'

@Module({
	imports: [
		TypeOrmModule.forFeature([RFIDDeviceEntity], DATA_SOURCE_DATA_LAKE),
		MongooseModule.forFeature(
			[{ name: RFIDDevice.name, collection: RFID_DEVICE_COLLECTION, schema: RFIDDeviceSchema }],
			DATA_WAREHOUSE_CONNECTION
		)
	],
	controllers: [RFIDDeviceController],
	providers: [
		...RFIDDeviceListeners,
		{ provide: RFID_DEVICE_REPOSITORY, useClass: RFIDDeviceRepository },
		RmdbsRFIDDeviceRepository
	],
	exports: [RFID_DEVICE_REPOSITORY]
})
export class RFIDDeviceModule implements OnModuleInit {
	constructor(
		@InjectModel(RFIDDevice.name, DATA_WAREHOUSE_CONNECTION)
		private readonly rfidDeviceModel: RFIDDeviceModel
	) {}

	async onModuleInit() {
		await this.rfidDeviceModel.syncIndexes()
	}
}
