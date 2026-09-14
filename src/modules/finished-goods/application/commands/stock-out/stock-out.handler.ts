import {
	FINISHED_GOODS_EPC_REPOSITORY,
	IFinishedGoodsEpcRepository
} from '@modules/finished-goods/application/ports/finished-goods-epc.repository.port'
import {
	IShippingProgressRepository,
	SHIPPING_PROGRESS_REPOSITORY
} from '@modules/finished-goods/application/ports/shipping-progress.repository.port'
import {
	IStockTransactionRepository,
	STOCK_TX_REPOSITORY
} from '@modules/finished-goods/application/ports/stock-transaction.repository.port'
import { StockOutTransaction } from '@modules/finished-goods/domain/models/stock-out-transaction.model'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { ORDER_REPOSITORY } from '@modules/order/order.constant'
import { IOrderRepository } from '@modules/order/order.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger } from 'nestjs-pino'
import { StockOutCommand } from './stock-out.command'

@CommandHandler(StockOutCommand)
export class StockOutHandler implements ICommandHandler<StockOutCommand> {
	constructor(
		@InjectPinoLogger(StockOutHandler.name) private readonly logger,
		@Inject(FINISHED_GOODS_EPC_REPOSITORY) private readonly epcMongoRepository: IFinishedGoodsEpcRepository,
		@Inject(ORDER_REPOSITORY)
		private readonly orderRepository: IOrderRepository,
		@Inject(SHIPPING_PROGRESS_REPOSITORY)
		private readonly shippingProgressMongoRepository: IShippingProgressRepository,
		@Inject(STOCK_TX_REPOSITORY)
		private readonly stockTransactionMongoRepository: IStockTransactionRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ manufacturingOrders, purchaseOrder, sizes }: StockOutCommand): Promise<void> {
		const pendingOutboundEpcs = await this.epcMongoRepository.getPendingShipOutEpcs(
			purchaseOrder,
			manufacturingOrders,
			sizes
		)

		const mo = Array.isArray(manufacturingOrders) ? manufacturingOrders : [manufacturingOrders]

		const moInventories = (
			await Promise.all(
				mo.map(async (m) =>
					(await this.orderRepository.getManufacturingOrderInventory(m)).map((item) => ({
						...item,
						size_numcode: new SizeNumber(item.size_numcode)
					}))
				)
			)
		).flat()

		const outboundProgress = (await this.shippingProgressMongoRepository.getPoOutboundProgress(purchaseOrder)).map(
			(item) => ({ ...item, size_numcode: new SizeNumber(item.size_numcode) })
		)

		const stockOutTransaction = new StockOutTransaction(pendingOutboundEpcs, outboundProgress, moInventories)

		const transactionId = stockOutTransaction.startTransaction()

		await this.stockTransactionMongoRepository.stockOut(transactionId, purchaseOrder, pendingOutboundEpcs)

		this.eventPublisher.mergeObjectContext(stockOutTransaction)
		stockOutTransaction.commit()
	}
}
