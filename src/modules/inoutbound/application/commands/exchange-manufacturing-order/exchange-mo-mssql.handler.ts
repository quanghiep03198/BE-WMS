import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../ports/io-mongo.repository.port'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '../../ports/io-mssql.repository.port'
import { ExchangeMoMssqlCommand } from './exchange-mo-mssql.command'

@CommandHandler(ExchangeMoMssqlCommand)
export class ExchangeMoMssqlHandler implements ICommandHandler<ExchangeMoMssqlCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY) private readonly ioMongoRepository: IIoMongoRepository,
		@Inject(IO_MSSQL_REPOSITORY) private readonly ioMssqlRepository: IIoMssqlRepository
	) {}

	public async execute(command: ExchangeMoMssqlCommand): Promise<void> {
		const exchangeSkus = await this.ioMongoRepository.getPendingExchangeEpcs(
			command.deviceSerialNumber,
			command.sourceMos
		)
		const moExchangeSession = await this.ioMssqlRepository.getPendingExchangeMosDetails(
			command.sourceMos,
			command.targetMo
		)

		moExchangeSession.verify(exchangeSkus)

		await this.ioMssqlRepository.exchangeManufacturingOrder(exchangeSkus, command.targetMo)
	}
}
