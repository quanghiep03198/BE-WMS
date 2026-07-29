import { StockTransaction } from '@modules/finished-goods/domain/models/stock-transaction.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../ports/io-mongo.repository.port'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '../../ports/io-mssql.repository.port'
import { StockOutCommand } from './stock-out.command'

@CommandHandler(StockOutCommand)
export class StockOutHandler implements ICommandHandler<StockOutCommand> {
	constructor(
		@Inject(IO_MSSQL_REPOSITORY) private readonly ioMssqlRepository: IIoMssqlRepository,
		@Inject(IO_MONGO_REPOSITORY) private readonly ioMongoRepository: IIoMongoRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ manufacturingOrders, purchaseOrder, sizes }: StockOutCommand): Promise<void> {
		const pendingOutboundEpcs = await this.ioMongoRepository.getPendingShipOutEpcs(
			purchaseOrder,
			manufacturingOrders,
			sizes
		)
		const outboundProgress = await this.ioMssqlRepository.getPoOutboundProgress(purchaseOrder, pendingOutboundEpcs)
		const stockOutTransaction = new StockTransaction('outbound', pendingOutboundEpcs, outboundProgress)
		stockOutTransaction.startTransaction()
		await this.ioMssqlRepository.stockOut(pendingOutboundEpcs)
		this.eventPublisher.mergeObjectContext(stockOutTransaction)
		stockOutTransaction.commit()
	}
}
