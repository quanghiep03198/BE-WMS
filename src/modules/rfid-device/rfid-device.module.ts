import { Module } from '@nestjs/common'
import { RFIDDeviceController } from './rfid-device.controller'
import { RFIDDeviceService } from './rfid-device.service'

@Module({
	controllers: [RFIDDeviceController],
	providers: [RFIDDeviceService]
})
export class RFIDDeviceModule {}
