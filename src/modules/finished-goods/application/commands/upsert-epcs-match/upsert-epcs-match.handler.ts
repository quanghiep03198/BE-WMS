import { UpsertEpcsMatchTransaction } from '@modules/finished-goods/domain/models/upsert-epcs-match-transaction.model'
import { ORDER_REPOSITORY } from '@modules/order/order.constant'
import { IOrderRepository } from '@modules/order/order.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../ports/io-mongo.repository.port'
import { UpsertEpcsMatchCommand } from './upsert-epcs-match.command'

/**
 * @description Exchange manufacturing order or update manufacturing order details for scanning EPC(s)
 */
@CommandHandler(UpsertEpcsMatchCommand)
export class UpsertEpcsMatchHandler implements ICommandHandler<UpsertEpcsMatchCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY)
		private readonly ioMongoRepository: IIoMongoRepository,

		private readonly eventPublisher: EventPublisher,
		// @InjectPinoLogger(UpsertEpcsMatchHandler.name) private readonly logger: PinoLogger
		@Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository
	) {}

	public async execute(command: UpsertEpcsMatchCommand): Promise<void> {
		const { deviceSerialNumber, sourceMo, targetMo, subMo, sizeNumber, quantity } = command

		const pendingExchangeEpcs = await this.ioMongoRepository.getPendingExchangeEpcs({
			deviceSerialNumber,
			manufacturingOrder: sourceMo,
			sizeNumber,
			quantity
		})
		const targetExchangeMo = await this.orderRepository.getManufacturingOrder(targetMo, subMo)
		const upsertEpcInfoTransaction = new UpsertEpcsMatchTransaction(pendingExchangeEpcs, targetExchangeMo, sizeNumber)
		const tx = upsertEpcInfoTransaction.startTransaction()

		await this.ioMongoRepository.upsertEpcsMatch(tx.getPayload(), false)

		this.eventPublisher.mergeObjectContext(upsertEpcInfoTransaction)
		upsertEpcInfoTransaction.commit()
	}
}
