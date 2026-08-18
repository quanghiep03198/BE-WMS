import {
	EPC_MONGO_REPOSITORY,
	IEpcMongoRepository
} from '@modules/finished-goods/application/ports/epc-mongo.repository.port'
import { MoExchangeTransaction } from '@modules/finished-goods/domain/models/mo-exchange-transaction.model'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { ORDER_REPOSITORY } from '@modules/order/order.constant'
import { IOrderRepository } from '@modules/order/order.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { ExchangeMoRmCommand } from '../impl/exchange-mo-rm.command'

@CommandHandler(ExchangeMoRmCommand)
export class ExchangeMoRmHandler implements ICommandHandler<ExchangeMoRmCommand> {
	constructor(
		@Inject(EPC_MONGO_REPOSITORY) private readonly epcMongoRepository: IEpcMongoRepository,
		@Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
		private readonly eventPublisher: EventPublisher,
		private readonly eventBus: EventBus
	) {}

	public async execute({ deviceSerialNumber, sourceMos, targetMo }: ExchangeMoRmCommand): Promise<void> {
		const pendingExchangeData = await this.epcMongoRepository.getPendingExchangeMos(deviceSerialNumber, sourceMos)
		const exchangeTargetMo = await this.orderRepository.getManufacturingOrder(targetMo)

		// * Create a new instance of MoExchangeTransaction with the pending exchange data and target MO information
		const moExchangeTransaction = new MoExchangeTransaction(
			pendingExchangeData.map((record) => ({
				...record,
				sizes: record.sizes.map((size) => new SizeNumber(size))
			})),
			{ ...exchangeTargetMo, sizes: exchangeTargetMo.sizes.map(({ size_numcode }) => new SizeNumber(size_numcode)) }
		)
		// * Validate the transaction and get the pending exchange SKUs
		const pendingExchangeSkus = moExchangeTransaction.startTransaction()
		await this.epcMongoRepository.exchangeManufacturingOrder(pendingExchangeSkus, targetMo)

		this.eventPublisher.mergeObjectContext(moExchangeTransaction)
		moExchangeTransaction.commit()
	}
}
