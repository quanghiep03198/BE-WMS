import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FPInventoryEntity } from '../rfid/entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'
import { ReportController } from './report.controller'
import { ReportService } from './report.service'

@Module({
	imports: [TypeOrmModule.forFeature([FPInventoryEntity, RFIDMatchCustomerEntity], DATA_SOURCE_DATA_LAKE)],
	controllers: [ReportController],
	providers: [ReportService]
})
export class ReportModule {}
