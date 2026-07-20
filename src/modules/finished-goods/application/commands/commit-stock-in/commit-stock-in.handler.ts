import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import { CommitStockInFailureEvent } from '@modules/finished-goods/domain/events/commit-stock-in-failure/commit-stock-in-failure.event'
import { CommitedStockIn } from '@modules/finished-goods/domain/events/committed-stock-in/commited-stock-in.event'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CommitStockInCommand } from './commit-stock-in.command'

@CommandHandler(CommitStockInCommand)
export class CommitStockInHandler implements ICommandHandler<CommitStockInCommand> {
	constructor(
		@InjectPinoLogger(CommitStockInHandler.name) private readonly logger: PinoLogger,
		@Inject(IO_MONGO_REPOSITORY) private readonly inoutboundMongoRepository: IIoMongoRepository,
		private readonly eventBus: EventBus
	) {}

	public async execute({ scannedEpcs }: CommitStockInCommand): Promise<void> {
		try {
			await this.inoutboundMongoRepository.commitStockIn(scannedEpcs)
			this.eventBus.publish(new CommitedStockIn(scannedEpcs.length))
		} catch (error) {
			this.logger.error(error)
			this.eventBus.publish(new CommitStockInFailureEvent('WH101', scannedEpcs))
			// throw error
		}
	}
}
