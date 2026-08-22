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
import { RecallFromStockTransaction } from '@modules/finished-goods/domain/models/recall-transaction.model'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { RecallFromStockCommand } from './recall-from-stock.command'

@CommandHandler(RecallFromStockCommand)
export class RecallFromStockHandler implements ICommandHandler<RecallFromStockCommand> {
	constructor(
		@Inject(EPC_MONGO_REPOSITORY) private readonly epcMongoRepository: IEpcMongoRepository,
		@Inject(INVENTORY_LEDGER_MG_REPOSITORY)
		private readonly inventoryLedgerMongoRepository: IInventoryLedgerMongoRepository,
		@Inject(STOCK_TX_MONGO_REPOSITORY)
		private readonly stockTransactionMongoRepository: IStockTransactionMongoRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ command }: RecallFromStockCommand): Promise<void> {
		const pendingRecallEpcs = await this.epcMongoRepository.getPendingStockMoveEpcs(
			command.inbound_device_sn,
			command.mo_no
		)

		const moInventory = (await this.inventoryLedgerMongoRepository.getMoInventory(command.mo_no)).map((item) => ({
			...item,
			size_numcode: new SizeNumber(item.size_numcode)
		}))

		const recallTransaction = new RecallFromStockTransaction(pendingRecallEpcs, moInventory)

		const transactionId = recallTransaction.startTransaction()

		await this.stockTransactionMongoRepository.recallFromStock(transactionId, pendingRecallEpcs)

		this.eventPublisher.mergeObjectContext(recallTransaction)

		recallTransaction.commit()
	}
}
