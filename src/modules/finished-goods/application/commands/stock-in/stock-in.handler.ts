import {
	FINISHED_GOODS_EPC_REPOSITORY,
	IFinishedGoodsEpcRepository
} from '@modules/finished-goods/application/ports/finished-goods-epc.repository.port'

import {
	IStockTransactionRepository,
	STOCK_TX_REPOSITORY
} from '@modules/finished-goods/application/ports/stock-transaction.repository.port'
import { StockInTransaction } from '@modules/finished-goods/domain/models/stock-in-transaction.model'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { ORDER_REPOSITORY } from '@modules/order/order.constant'
import { IOrderRepository } from '@modules/order/order.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { StockInCommand } from './stock-in.command'

@CommandHandler(StockInCommand)
export class StockInHandler implements ICommandHandler<StockInCommand> {
	constructor(
		@InjectPinoLogger(StockInHandler.name)
		private readonly logger: PinoLogger,
		@Inject(FINISHED_GOODS_EPC_REPOSITORY) private readonly finishedGoodsEpcRepository: IFinishedGoodsEpcRepository,
		@Inject(ORDER_REPOSITORY)
		private readonly orderRepository: IOrderRepository,
		@Inject(STOCK_TX_REPOSITORY)
		private readonly stockTransactionMongoRepository: IStockTransactionRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ command }: StockInCommand): Promise<void> {
		const pendingInboundEpcs = await this.finishedGoodsEpcRepository.getPendingStockMoveEpcs(
			command.inbound_device_sn,
			command.mo_no,
			`${command.dept_code}/${command.dept_name}`,
			`${command.storage_num}/${command.storage_name}`
		)

		const currentInboundProgress = (await this.orderRepository.getManufacturingOrderInventory(command.mo_no)).map(
			(item) => ({
				...item,
				size_numcode: new SizeNumber(item.size_numcode)
			})
		)

		this.logger.debug(currentInboundProgress)

		// * Start Unit of Work transaction for inbound stock-in process
		const inboundTransaction = new StockInTransaction(pendingInboundEpcs, currentInboundProgress)
		const transactionId = inboundTransaction.startTransaction()

		await this.stockTransactionMongoRepository.stockIn(transactionId, pendingInboundEpcs)

		this.eventPublisher.mergeObjectContext(inboundTransaction)
		inboundTransaction.commit()
	}
}
