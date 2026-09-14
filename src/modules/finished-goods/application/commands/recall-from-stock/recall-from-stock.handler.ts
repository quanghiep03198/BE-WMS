import {
	FINISHED_GOODS_EPC_REPOSITORY,
	IFinishedGoodsEpcRepository
} from '@modules/finished-goods/application/ports/finished-goods-epc.repository.port'
import {
	IStockTransactionRepository,
	STOCK_TX_REPOSITORY
} from '@modules/finished-goods/application/ports/stock-transaction.repository.port'
import { RecallFromStockTransaction } from '@modules/finished-goods/domain/models/recall-transaction.model'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { ORDER_REPOSITORY } from '@modules/order/order.constant'
import { IOrderRepository } from '@modules/order/order.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { RecallFromStockCommand } from './recall-from-stock.command'

@CommandHandler(RecallFromStockCommand)
export class RecallFromStockHandler implements ICommandHandler<RecallFromStockCommand> {
	constructor(
		@Inject(FINISHED_GOODS_EPC_REPOSITORY) private readonly epcMongoRepository: IFinishedGoodsEpcRepository,
		@Inject(ORDER_REPOSITORY)
		private readonly orderRepository: IOrderRepository,
		@Inject(STOCK_TX_REPOSITORY)
		private readonly stockTransactionMongoRepository: IStockTransactionRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ command }: RecallFromStockCommand): Promise<void> {
		const pendingRecallEpcs = await this.epcMongoRepository.getPendingStockMoveEpcs(
			command.inbound_device_sn,
			command.mo_no
		)

		const moInventory = (await this.orderRepository.getManufacturingOrderInventory(command.mo_no)).map((item) => ({
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
