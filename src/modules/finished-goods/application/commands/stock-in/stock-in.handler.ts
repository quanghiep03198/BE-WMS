import {
	EPC_MONGO_REPOSITORY,
	IEpcMongoRepository
} from '@modules/finished-goods/application/ports/epc-mongo.repository.port'
import {
	IInventoryVariationMongoRepository,
	INVENTORY_VARIATION_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/inventory-variation-mongo.repository.port'
import {
	IStockTransactionMongoRepository,
	STOCK_TRANSACTION_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/stock-transaction-mongo.repository.port'
import { StockInTransaction } from '@modules/finished-goods/domain/models/stock-in-transaction.model'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger } from 'nestjs-pino'
import { StockInCommand } from './stock-in.command'

@CommandHandler(StockInCommand)
export class StockInHandler implements ICommandHandler<StockInCommand> {
	constructor(
		@Inject(EPC_MONGO_REPOSITORY) private readonly epcMongoRepository: IEpcMongoRepository,
		@Inject(INVENTORY_VARIATION_MONGO_REPOSITORY)
		private readonly inventoryVariationMongoRepository: IInventoryVariationMongoRepository,
		@Inject(STOCK_TRANSACTION_MONGO_REPOSITORY)
		private readonly stockTransactionMongoRepository: IStockTransactionMongoRepository,
		@InjectPinoLogger(StockInHandler.name) private readonly logger,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ command }: StockInCommand): Promise<void> {
		const pendingInboundEpcs = await this.epcMongoRepository.getPendingStockMoveEpcs(
			command.inbound_device_sn,
			command.mo_no,
			`${command.dept_code}/${command.dept_name}`,
			`${command.storage_num}/${command.storage_name}`
		)

		const currentInboundProgress = (await this.inventoryVariationMongoRepository.getMoInventory(command.mo_no)).map(
			(item) => ({ ...item, size_numcode: new SizeNumber(item.size_numcode) })
		)

		// * Start Unit of Work transaction for inbound stock-in process
		const inboundTransaction = new StockInTransaction(pendingInboundEpcs, currentInboundProgress)
		inboundTransaction.startTransaction()

		await this.stockTransactionMongoRepository.stockIn(pendingInboundEpcs)

		this.eventPublisher.mergeObjectContext(inboundTransaction)
		inboundTransaction.commit()
	}
}
