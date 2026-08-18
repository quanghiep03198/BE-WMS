import {
	EPC_MONGO_REPOSITORY,
	IEpcMongoRepository
} from '@modules/finished-goods/application/ports/epc-mongo.repository.port'
import {
	IInventoryVariationMongoRepository,
	INVENTORY_VARIATION_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/inventory-variation-mongo.repository.port'
import {
	IShippingProgressMongoRepository,
	SHIPPING_PROGRESS_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/shipping-progress-mongo.repository.port'
import {
	IStockTransactionMongoRepository,
	STOCK_TRANSACTION_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/stock-transaction-mongo.repository.port'
import { StockOutTransaction } from '@modules/finished-goods/domain/models/stock-out-transaction.model'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger } from 'nestjs-pino'
import { StockOutCommand } from './stock-out.command'

@CommandHandler(StockOutCommand)
export class StockOutHandler implements ICommandHandler<StockOutCommand> {
	constructor(
		@InjectPinoLogger(StockOutHandler.name) private readonly logger,
		@Inject(EPC_MONGO_REPOSITORY) private readonly epcMongoRepository: IEpcMongoRepository,
		@Inject(INVENTORY_VARIATION_MONGO_REPOSITORY)
		private readonly inventoryVariationMongoRepository: IInventoryVariationMongoRepository,
		@Inject(SHIPPING_PROGRESS_MONGO_REPOSITORY)
		private readonly shippingProgressMongoRepository: IShippingProgressMongoRepository,
		@Inject(STOCK_TRANSACTION_MONGO_REPOSITORY)
		private readonly stockTransactionMongoRepository: IStockTransactionMongoRepository,
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
					(await this.inventoryVariationMongoRepository.getMoInventory(m)).map((item) => ({
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

		stockOutTransaction.startTransaction()

		await this.stockTransactionMongoRepository.stockOut(pendingOutboundEpcs)

		this.eventPublisher.mergeObjectContext(stockOutTransaction)
		stockOutTransaction.commit()
	}
}
