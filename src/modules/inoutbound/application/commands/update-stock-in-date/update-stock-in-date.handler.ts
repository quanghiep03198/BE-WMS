import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@/modules/inoutbound/application/ports/io-mongo.repository.port'
import { UpdateStockInDateFailedEvent } from '@/modules/inoutbound/domain/events/update-stock-in-date-failed/update-stock-in-date-failed.event'
import { UpdateStockInDateSuccessEvent } from '@/modules/inoutbound/domain/events/update-stock-in-date-success/update-stock-in-date-success.event'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { UpdateStockInDateCommand } from './update-stock-in-date.command'

@CommandHandler(UpdateStockInDateCommand)
export class UpdateStockInDateHandler implements ICommandHandler<UpdateStockInDateCommand> {
	constructor(
		@InjectPinoLogger(UpdateStockInDateHandler.name) private readonly logger: PinoLogger,
		@Inject(IO_MONGO_REPOSITORY) private readonly inoutboundMongoRepository: IIoMongoRepository,
		private readonly eventBus: EventBus
	) {}

	public async execute({ scannedEpcs }: UpdateStockInDateCommand): Promise<void> {
		try {
			this.logger.debug(scannedEpcs.map((item) => item.getStockKeepingUnit()))
			await this.inoutboundMongoRepository.updateInboundTimestamp(scannedEpcs)
			this.eventBus.publish(
				new UpdateStockInDateSuccessEvent({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
			)
		} catch (error) {
			this.logger.error(error)
			this.eventBus.publish(new UpdateStockInDateFailedEvent('WH101', scannedEpcs))
			throw error
		}
	}
}
