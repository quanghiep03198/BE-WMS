import { Module } from '@nestjs/common'
import { ORDER_REPOSITORY } from './order.constant'
import { OrderController } from './order.controller'
import { OrderRepository } from './order.repository'
import { OrderService } from './order.service'

@Module({
	controllers: [OrderController],
	providers: [OrderService, { provide: ORDER_REPOSITORY, useClass: OrderRepository }],
	exports: [OrderService, ORDER_REPOSITORY]
})
export class OrderModule {}
