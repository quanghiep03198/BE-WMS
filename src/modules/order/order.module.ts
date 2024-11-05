import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TransferOrderController } from './controllers/transfer-order.controller'
import { TransferOrderDetailEntity } from './entities/transfer-order-detail.entity'
import { TransferOrderEntity } from './entities/transfer-order.entity'
import { TransferOrderService } from './services/transfer-order.service'
import { TransferOrderEntitySubscriber } from './subscribers/transfer-order.entity.subscriber'

@Module({
	imports: [TypeOrmModule.forFeature([TransferOrderEntity, TransferOrderDetailEntity], DATA_SOURCE_DATA_LAKE)],
	controllers: [TransferOrderController],
	providers: [TransferOrderService, TransferOrderEntitySubscriber]
})
export class OrderModule {}
