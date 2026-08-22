import {
	EPC_MONGO_REPOSITORY,
	IEpcMongoRepository
} from '@modules/finished-goods/application/ports/epc-mongo.repository.port'
import {
	IInventoryLedgerMongoRepository,
	INVENTORY_LEDGER_MG_REPOSITORY
} from '@modules/finished-goods/application/ports/inventory-ledger-mongo.repository.port'
import {
	IStockTransactionMongoRepository,
	STOCK_TX_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/stock-transaction-mongo.repository.port'
import { StockInTransaction } from '@modules/finished-goods/domain/models/stock-in-transaction.model'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { StockInCommand } from './stock-in.command'

@CommandHandler(StockInCommand)
export class StockInHandler implements ICommandHandler<StockInCommand> {
	constructor(
		@Inject(EPC_MONGO_REPOSITORY) private readonly epcMongoRepository: IEpcMongoRepository,
		@Inject(INVENTORY_LEDGER_MG_REPOSITORY)
		private readonly inventoryLedgerMongoRepository: IInventoryLedgerMongoRepository,
		@Inject(STOCK_TX_MONGO_REPOSITORY)
		private readonly stockTransactionMongoRepository: IStockTransactionMongoRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ command }: StockInCommand): Promise<void> {
		const pendingInboundEpcs = await this.epcMongoRepository.getPendingStockMoveEpcs(
			command.inbound_device_sn,
			command.mo_no,
			`${command.dept_code}/${command.dept_name}`,
			`${command.storage_num}/${command.storage_name}`
		)

		const currentInboundProgress = (await this.inventoryLedgerMongoRepository.getMoInventory(command.mo_no)).map(
			(item) => ({ ...item, size_numcode: new SizeNumber(item.size_numcode) })
		)

		// * Start Unit of Work transaction for inbound stock-in process
		const inboundTransaction = new StockInTransaction(pendingInboundEpcs, currentInboundProgress)
		const transactionId = inboundTransaction.startTransaction()

		await this.stockTransactionMongoRepository.stockIn(transactionId, pendingInboundEpcs)

		this.eventPublisher.mergeObjectContext(inboundTransaction)
		inboundTransaction.commit()
	}
}
