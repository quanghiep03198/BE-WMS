import { Module } from '@nestjs/common'
import { DynamicDataSourceService } from '../_shared/services/dynamic-datasource.service'
import { RFIDController } from './rfid.controller'
import { RFIDService } from './rfid.service'

@Module({
	controllers: [RFIDController],
	providers: [RFIDService, DynamicDataSourceService]
})
export class RFIDModule {}
