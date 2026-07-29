import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import { StockTransaction } from '@modules/finished-goods/domain/models/stock-transaction.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger } from 'nestjs-pino'
import { StockInCommand } from './stock-in.command'

@CommandHandler(StockInCommand)
export class StockInHandler implements ICommandHandler<StockInCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY) private readonly inoutboundMongoRepository: IIoMongoRepository,
		@InjectPinoLogger(StockInHandler.name) private readonly logger,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ command }: StockInCommand): Promise<void> {
		const pendingInboundEpcs = await this.inoutboundMongoRepository.getPendingStockMoveEpcs(
			command.inbound_device_sn,
			command.mo_no,
			command.username,
			`${command.dept_code}/${command.dept_name}`,
			command.storage
		)

		const currentInboundProgress = await this.inoutboundMongoRepository.getMoInventory(command.mo_no)

		this.logger.debug(currentInboundProgress)
		// * Start Unit of Work transaction for inbound stock-in process
		const inboundTransaction = new StockTransaction('inbound', pendingInboundEpcs, currentInboundProgress)
		inboundTransaction.startTransaction()

		await this.inoutboundMongoRepository.stockIn(pendingInboundEpcs)

		this.eventPublisher.mergeObjectContext(inboundTransaction)
		inboundTransaction.commit()
	}
}
