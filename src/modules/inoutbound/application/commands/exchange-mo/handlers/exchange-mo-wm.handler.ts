import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../../ports/io-mongo.repository.port'
import { ExchangeMoWmCommand } from '../impl/exchange-mo-wm.command'

@CommandHandler(ExchangeMoWmCommand)
export class ExchangeMoWmHandler implements ICommandHandler<ExchangeMoWmCommand> {
	constructor(@Inject(IO_MONGO_REPOSITORY) private readonly ioMongoRepository: IIoMongoRepository) {}

	public async execute(command: ExchangeMoWmCommand): Promise<void> {
		await this.ioMongoRepository.exchangeMo(command.pendingExchangeSkus, command.targetMo)
	}
}
