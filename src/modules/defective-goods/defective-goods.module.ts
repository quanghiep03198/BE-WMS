import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { DefectiveGoodsController } from './defective-goods.controller'
import { DefectiveGoodsEntity } from './entities/defective-goods.entity'
import { DefectiveGoodsService } from './services/defective-goods.service'
import { DefectiveGoodsInboundService } from './services/defective-inbound.service'
import { DefectiveGoodsInventoryService } from './services/defective-inventory.service'
import { DefectiveGoodsOutboundService } from './services/defective-outbound.service'

@Module({
	imports: [TenancyModule, TypeOrmModule.forFeature([DefectiveGoodsEntity], DATA_SOURCE_DATA_LAKE)],
	controllers: [DefectiveGoodsController],
	providers: [
		DefectiveGoodsService,
		DefectiveGoodsInboundService,
		DefectiveGoodsOutboundService,
		DefectiveGoodsInventoryService
	]
})
export class DefectiveGoodsModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(TenacyMiddleware)
			.forRoutes(
				{ path: '/defective-goods/daily-inbound', method: RequestMethod.GET },
				{ path: '/defective-goods/export-daily-inbound', method: RequestMethod.GET },
				{ path: '/defective-goods/daily-outbound', method: RequestMethod.GET },
				{ path: '/defective-goods/export-daily-outbound', method: RequestMethod.GET },
				{ path: '/defective-goods/inventory', method: RequestMethod.GET },
				{ path: '/defective-goods/export-inventory-report', method: RequestMethod.GET }
			)
	}
}
