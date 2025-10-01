import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { EventGateway } from '@/events/event.gateway'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { DefectiveGoodsController } from './defective-goods.controller'
import { DefectiveGoodsService } from './defective-goods.service'
import { DefectiveGoodEntity } from './entities/defective-goods.entity'

@Module({
	imports: [TenancyModule, TypeOrmModule.forFeature([DefectiveGoodEntity], DATA_SOURCE_DATA_LAKE)],
	controllers: [DefectiveGoodsController],
	providers: [DefectiveGoodsService, EventGateway]
})
export class DefectiveGoodsModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(TenacyMiddleware)
			.forRoutes(
				{ path: '/defective-goods/inventory', method: RequestMethod.GET },
				{ path: '/defective-goods/export-inventory-report', method: RequestMethod.GET }
			)
	}
}
