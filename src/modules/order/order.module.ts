import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TransferOrderController } from './controllers/transfer-order.controller'
import { TransferOrderDetailEntity } from './entities/transfer-order-detail.entity'
import { TransferOrderEntity } from './entities/transfer-order.entity'
import { TransferOrderService } from './services/transfer-order.service'

@Module({
	imports: [TypeOrmModule.forFeature([TransferOrderEntity, TransferOrderDetailEntity], DATASOURCE_DATA_LAKE)],
	controllers: [TransferOrderController],
	providers: [TransferOrderService]
})
export class OrderModule {}
