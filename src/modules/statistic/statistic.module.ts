import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { FinishedGoodsModule } from '@modules/finished-goods/finished-goods.module'
import { InventoryModule } from '@modules/inventory/inventory.module'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DefectiveGoodsEntity } from '../defective-goods/entities/defective-goods.entity'
import { StatisticController } from './statistic.controller'
import { StatisticService } from './statistic.service'

@Module({
	imports: [
		FinishedGoodsModule,
		InventoryModule,
		TypeOrmModule.forFeature([DefectiveGoodsEntity], DATA_SOURCE_DATA_LAKE)
	],
	controllers: [StatisticController],
	providers: [StatisticService]
})
export class StatisticModule {
	// configure(consumer: MiddlewareConsumer) {
	// 	consumer.apply(TenacyMiddleware).forRoutes(StatisticController)
	// }
}
