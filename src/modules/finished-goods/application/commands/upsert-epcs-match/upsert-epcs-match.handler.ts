import { UpsertEpcsMatchTransaction } from '@modules/finished-goods/domain/models/upsert-epcs-match-transaction.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../ports/io-mongo.repository.port'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '../../ports/io-mssql.repository.port'
import { UpsertEpcsMatchCommand } from './upsert-epcs-match.command'

/**
 * @description Exchange manufacturing order or update manufacturing order details for scanning EPC(s)
 */
@CommandHandler(UpsertEpcsMatchCommand)
export class UpsertEpcsMatchHandler implements ICommandHandler<UpsertEpcsMatchCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY)
		private readonly ioMongoRepository: IIoMongoRepository,
		@Inject(IO_MSSQL_REPOSITORY)
		private readonly ioMssqlRepository: IIoMssqlRepository,
		private readonly eventPublisher: EventPublisher,
		@InjectPinoLogger(UpsertEpcsMatchHandler.name) private readonly logger: PinoLogger
	) {}

	public async execute(command: UpsertEpcsMatchCommand): Promise<void> {
		const { deviceSerialNumber, sourceMo, targetMo, subMo, sizeNumber, quantity } = command

		const pendingExchangeEpcs = await this.ioMongoRepository.getPendingExchangeEpcs({
			deviceSerialNumber,
			manufacturingOrder: sourceMo,
			quantity
		})
		const targetExchangeMo = await this.ioMssqlRepository.getExchangeTargetMo(targetMo, subMo)
		const upsertEpcInfoTransaction = new UpsertEpcsMatchTransaction(pendingExchangeEpcs, targetExchangeMo, sizeNumber)
		const tx = upsertEpcInfoTransaction.startTransaction()

		await this.ioMssqlRepository.upsertEpcsMatch(tx.getPayload())

		this.eventPublisher.mergeObjectContext(upsertEpcInfoTransaction)
		upsertEpcInfoTransaction.commit()
	}
}
