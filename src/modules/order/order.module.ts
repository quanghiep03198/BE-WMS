import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { FinishedGoodsModule } from '@modules/finished-goods/finished-goods.module'
import { forwardRef, Module } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { PinoLogger } from 'nestjs-pino'
import { ORDER_REPOSITORY } from './order.constant'
import { OrderController } from './order.controller'
import { OrderRepository } from './order.repository'
import { OrderTask } from './order.task'
import {
	MANUFACTURING_ORDERS_COLLECTION,
	ManufacturingOrder,
	ManufacturingOrderModel,
	ManufacturingOrderSchema
} from './schemas/manufacturing-order.schema'
import {
	PURCHASE_ORDER_COLLECTION,
	PurchaseOrder,
	PurchaseOrderModel,
	PurchaseOrderSchema
} from './schemas/purchase-order.schema'

@Module({
	imports: [
		forwardRef(() => FinishedGoodsModule),
		MongooseModule.forFeature(
			[
				{
					name: ManufacturingOrder.name,
					collection: MANUFACTURING_ORDERS_COLLECTION,
					schema: ManufacturingOrderSchema
				},
				{
					name: PurchaseOrder.name,
					collection: PURCHASE_ORDER_COLLECTION,
					schema: PurchaseOrderSchema
				}
			],
			DATA_WAREHOUSE_CONNECTION
		)
	],
	controllers: [OrderController],
	providers: [{ provide: ORDER_REPOSITORY, useClass: OrderRepository }, OrderTask],
	exports: [MongooseModule, ORDER_REPOSITORY]
})
export class OrderModule {
	constructor(
		private readonly logger: PinoLogger,

		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,

		@InjectModel(PurchaseOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly purchaseOrderModel: PurchaseOrderModel
	) {}

	async onModuleInit() {
		try {
			await this.purchaseOrderModel.syncIndexes()
			await this.manufacturingOrderModel.syncIndexes()
		} catch (error) {
			this.logger.error(error)
		}
	}
}
