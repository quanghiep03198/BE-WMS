import { StockOutTransaction } from '@modules/finished-goods/domain/models/stock-out-transaction.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger } from 'nestjs-pino'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../ports/io-mongo.repository.port'
import { StockOutCommand } from './stock-out.command'

@CommandHandler(StockOutCommand)
export class StockOutHandler implements ICommandHandler<StockOutCommand> {
	constructor(
		@InjectPinoLogger(StockOutHandler.name) private readonly logger,
		@Inject(IO_MONGO_REPOSITORY) private readonly ioMongoRepository: IIoMongoRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ manufacturingOrders, purchaseOrder, sizes }: StockOutCommand): Promise<void> {
		const pendingOutboundEpcs = await this.ioMongoRepository.getPendingShipOutEpcs(
			purchaseOrder,
			manufacturingOrders,
			sizes
		)

		const mo = Array.isArray(manufacturingOrders) ? manufacturingOrders : [manufacturingOrders]

		const moInventories = (await Promise.all(mo.map((m) => this.ioMongoRepository.getMoInventory(m)))).flat()

		const outboundProgress = await this.ioMongoRepository.getPoOutboundProgress(purchaseOrder)

		const stockOutTransaction = new StockOutTransaction(pendingOutboundEpcs, outboundProgress, moInventories)

		stockOutTransaction.startTransaction()

		await this.ioMongoRepository.stockOut(pendingOutboundEpcs)

		this.eventPublisher.mergeObjectContext(stockOutTransaction)
		stockOutTransaction.commit()
	}
}
