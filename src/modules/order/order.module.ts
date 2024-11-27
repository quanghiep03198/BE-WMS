import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ImportOrderController } from './controllers/import-order.controller'
import { TransferOrderController } from './controllers/transfer-order.controller'
import { ImportOrderDetailEntity } from './entities/import-order-detail.entity'
import { ImportOrderEntity } from './entities/import-order.entity'
import { TransferOrderDetailEntity } from './entities/transfer-order-detail.entity'
import { TransferOrderEntity } from './entities/transfer-order.entity'
import { ImportOrderService } from './services/import-order.service'
import { TransferOrderService } from './services/transfer-order.service'
import { TransferOrderEntitySubscriber } from './subscribers/transfer-order.entity.subscriber'

@Module({
	imports: [
		TypeOrmModule.forFeature(
			[TransferOrderEntity, TransferOrderDetailEntity, ImportOrderDetailEntity, ImportOrderEntity],
			DATA_SOURCE_DATA_LAKE
		)
	],
	controllers: [TransferOrderController, ImportOrderController],
	providers: [TransferOrderService, TransferOrderEntitySubscriber, ImportOrderService]
})
export class OrderModule {}
