import { ExchangeMoSuccessEvent } from '@modules/finished-goods/domain/events/exchange-mo-success/exchange-mo-success.event'
import { UpsertEpcInfoTransaction } from '@modules/finished-goods/domain/models/upsert-epc-info-transaction.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../ports/io-mongo.repository.port'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '../../ports/io-mssql.repository.port'
import { UpsertEpcInfoCommand } from './upsert-epc-info.command'

@CommandHandler(UpsertEpcInfoCommand)
export class UpsertEpcInfoHandler implements ICommandHandler<UpsertEpcInfoCommand> {
	constructor(
		@InjectPinoLogger(UpsertEpcInfoHandler.name) private readonly logger: PinoLogger,
		@Inject(IO_MONGO_REPOSITORY)
		private readonly ioMongoRepository: IIoMongoRepository,
		@Inject(IO_MSSQL_REPOSITORY)
		private readonly ioMssqlRepository: IIoMssqlRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute(command: UpsertEpcInfoCommand): Promise<void> {
		const pendingExchangeEpcs = await this.ioMongoRepository.getPendingExchangeEpcs({
			deviceSerialNumber: command.deviceSerialNumber,
			manufacturingOrder: command.sourceMo,
			sizeNumber: command.sizeNumber,
			quantity: command.quantity
		})

		const targetExchangeMo = await this.ioMssqlRepository.getExchangeTargetMo(command.targetMo, command.subMo)

		const upsertEpcInfoTransaction = new UpsertEpcInfoTransaction(pendingExchangeEpcs, targetExchangeMo)

		const result = upsertEpcInfoTransaction.validate()

		await this.ioMssqlRepository.exchangeManufacturingOrder(result.exchangableEpcs, result.targetMo)

		upsertEpcInfoTransaction.apply(new ExchangeMoSuccessEvent(result.exchangableEpcs, result.targetMo))
		this.eventPublisher.mergeObjectContext(upsertEpcInfoTransaction)
		upsertEpcInfoTransaction.commit()
	}
}
