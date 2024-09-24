import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RFIDCustomerEntity } from './entities/rfid-customer.entity'
import { RFIDInventoryEntity } from './entities/rfid-inventory.entity'
import { RFIDController } from './rfid.controller'
import { RFIDService } from './rfid.service'

@Module({
	imports: [TypeOrmModule.forFeature([RFIDInventoryEntity, RFIDCustomerEntity], DATASOURCE_DATA_LAKE)],
	controllers: [RFIDController],
	providers: [RFIDService]
})
export class RFIDModule {}
