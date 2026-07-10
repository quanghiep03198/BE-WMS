import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DefectiveGoodsEntity } from '../defective-goods/entities/defective-goods.entity'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { StatisticController } from './statistic.controller'
import { StatisticService } from './statistic.service'

@Module({
	imports: [TypeOrmModule.forFeature([DefectiveGoodsEntity], DATA_SOURCE_DATA_LAKE), TenancyModule],
	controllers: [StatisticController],
	providers: [StatisticService]
})
export class StatisticModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes(StatisticController)
	}
}
