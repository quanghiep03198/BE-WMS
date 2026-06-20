import { UpdateStockInDateFailedEvent } from '@/modules/inoutbound/domain/events/update-stock-in-date-failed/update-stock-in-date-failed.event'
import {
	IInoutboundMongoRepository,
	IO_MONGO_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/io-mongo.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { UpdateStockInDateCommand } from './update-stock-in-date.command'

@CommandHandler(UpdateStockInDateCommand)
export class UpdateStockInDateHandler implements ICommandHandler<UpdateStockInDateCommand> {
	constructor(
		@InjectPinoLogger(UpdateStockInDateHandler.name) private readonly logger: PinoLogger,
		@Inject(IO_MONGO_REPOSITORY) private readonly inoutboundMongoRepository: IInoutboundMongoRepository,
		private readonly eventBus: EventBus
	) {}

	public async execute({ scannedEpcs }: UpdateStockInDateCommand): Promise<number> {
		try {
			if (1 === 1) throw new Error('RollbackMssqlInboundDataEvent')

			this.logger.debug(scannedEpcs.map((item) => item.getStockKeepingUnit()))
			return await this.inoutboundMongoRepository.updateStockInDate(scannedEpcs)
		} catch (error) {
			this.logger.error(error)
			this.eventBus.publish(new UpdateStockInDateFailedEvent(scannedEpcs))
		}
	}
}
