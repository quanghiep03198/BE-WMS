import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@/modules/inoutbound/application/ports/io-mongo.repository.port'
import { UpdateStockInTimestampFailedEvent } from '@/modules/inoutbound/domain/events/update-stock-in-timestamp-failed/update-stock-in-date-failed.event'
import { UpdateStockInTimestampSuccessEvent } from '@/modules/inoutbound/domain/events/update-stock-in-timestamp-success/update-stock-in-timestamp-success.event'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { UpdateStockInTimestampCommand } from './update-stock-in-timestamp.command'

@CommandHandler(UpdateStockInTimestampCommand)
export class UpdateStockInTimestampHandler implements ICommandHandler<UpdateStockInTimestampCommand> {
	constructor(
		@InjectPinoLogger(UpdateStockInTimestampHandler.name) private readonly logger: PinoLogger,
		@Inject(IO_MONGO_REPOSITORY) private readonly inoutboundMongoRepository: IIoMongoRepository,
		private readonly eventBus: EventBus
	) {}

	public async execute({ scannedEpcs }: UpdateStockInTimestampCommand): Promise<void> {
		try {
			this.logger.debug(scannedEpcs.map((item) => item.getStockKeepingUnit()))
			await this.inoutboundMongoRepository.updateInboundTimestamp(scannedEpcs)
			this.eventBus.publish(
				new UpdateStockInTimestampSuccessEvent({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
			)
		} catch (error) {
			this.logger.error(error)
			this.eventBus.publish(new UpdateStockInTimestampFailedEvent('WH101', scannedEpcs))
			throw error
		}
	}
}
