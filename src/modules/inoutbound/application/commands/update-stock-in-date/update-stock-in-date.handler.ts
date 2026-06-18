import {
	IInoutboundMongoRepository,
	IO_MONGO_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/io-mongo.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { UpdateStockInDateCommand } from './update-stock-in-date.command'

@CommandHandler(UpdateStockInDateCommand)
export class UpdateStockInDateHandler implements ICommandHandler<UpdateStockInDateCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY) private readonly inoutboundMongoRepository: IInoutboundMongoRepository,
		@InjectPinoLogger(UpdateStockInDateHandler.name) private readonly logger: PinoLogger
	) {}

	public async execute({ command }: UpdateStockInDateCommand): Promise<number> {
		try {
			return await this.inoutboundMongoRepository.updateStockInDate(command.scannedEpcs)
		} catch (error) {
			this.logger.error(error)
		}
	}
}
