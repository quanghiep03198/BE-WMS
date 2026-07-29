import { RecallFromStockTransaction } from '@modules/finished-goods/domain/models/recall-transaction.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../ports/io-mongo.repository.port'
import { RecallFromStockCommand } from './recall-from-stock.command'

@CommandHandler(RecallFromStockCommand)
export class RecallFromStockHandler implements ICommandHandler<RecallFromStockCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY) private readonly ioMongoRepository: IIoMongoRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ command }: RecallFromStockCommand): Promise<void> {
		const pendingRecallEpcs = await this.ioMongoRepository.getPendingStockMoveEpcs(
			command.inbound_device_sn,
			command.mo_no
		)

		const moInventory = await this.ioMongoRepository.getMoInventory(command.mo_no)

		const recallTransaction = new RecallFromStockTransaction(pendingRecallEpcs, moInventory)

		recallTransaction.startTransaction()

		await this.ioMongoRepository.recallFromStock(pendingRecallEpcs)

		this.eventPublisher.mergeObjectContext(recallTransaction)

		recallTransaction.commit()
	}
}
