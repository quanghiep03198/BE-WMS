import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RFIDDeviceEntity } from './entities/rfid-device.entity'
import { RFIDDeviceController } from './rfid-device.controller'
import { RFIDDeviceService } from './rfid-device.service'

@Module({
	imports: [TypeOrmModule.forFeature([RFIDDeviceEntity], DATA_SOURCE_DATA_LAKE)],
	controllers: [RFIDDeviceController],
	providers: [RFIDDeviceService]
})
export class RFIDDeviceModule {}
