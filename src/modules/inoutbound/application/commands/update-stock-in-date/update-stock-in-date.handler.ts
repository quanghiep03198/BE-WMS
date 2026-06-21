import { UpdateStockInDateFailedEvent } from '@/modules/inoutbound/domain/events/update-stock-in-date-failed/update-stock-in-date-failed.event'
import { UpdateStockInDateSuccessEvent } from '@/modules/inoutbound/domain/events/update-stock-in-date-success/update-stock-in-date-success.event'
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
			this.logger.debug(scannedEpcs.map((item) => item.getStockKeepingUnit()))
			const result = await this.inoutboundMongoRepository.updateInboundTimestamp(scannedEpcs)
			this.eventBus.publish(
				new UpdateStockInDateSuccessEvent({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
			)
			return result
		} catch (error) {
			this.logger.error(error)
			this.eventBus.publish(new UpdateStockInDateFailedEvent('WH101', scannedEpcs))
			throw error
		}
	}
}
