import { DATA_LAKE_CONNECTION } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DynamicDataSourceService } from '../_shared/dynamic-datasource.service'
import { RFIDInventoryEntity } from './entities/rfid-inventory.entity'
import { RFIDController } from './rfid.controller'
import { RFIDService } from './rfid.service'

@Module({
	imports: [TypeOrmModule.forFeature([RFIDInventoryEntity], DATA_LAKE_CONNECTION)],
	controllers: [RFIDController],
	providers: [RFIDService, DynamicDataSourceService]
})
export class RFIDModule {}
