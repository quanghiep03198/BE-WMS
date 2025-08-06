import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { OrderController } from './order.controller'
import { OrderService } from './order.service'

@Module({
	imports: [TenancyModule],
	controllers: [OrderController],
	providers: [OrderService],
	exports: [OrderService]
})
export class OrderModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(TenacyMiddleware)
			.forRoutes(
				{ path: 'order/command-number/search', method: RequestMethod.GET },
				{ path: 'order/purchase-order/search', method: RequestMethod.GET }
			)
	}
}
