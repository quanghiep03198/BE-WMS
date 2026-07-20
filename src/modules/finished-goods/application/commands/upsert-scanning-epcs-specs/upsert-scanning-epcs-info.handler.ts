import { UpsertEpcsMatchTransaction } from '@modules/finished-goods/domain/models/upsert-epc-info-transaction.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../ports/io-mongo.repository.port'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '../../ports/io-mssql.repository.port'
import { UpsertScanningEpcsInfoCommand } from './upsert-scanning-epcs-info.command'

/**
 * @description Exchange manufacturing order or update manufacturing order details for scanning EPC(s)
 */
@CommandHandler(UpsertScanningEpcsInfoCommand)
export class UpsertScanningEpcsInfoHandler implements ICommandHandler<UpsertScanningEpcsInfoCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY)
		private readonly ioMongoRepository: IIoMongoRepository,
		@Inject(IO_MSSQL_REPOSITORY)
		private readonly ioMssqlRepository: IIoMssqlRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute(command: UpsertScanningEpcsInfoCommand): Promise<void> {
		const { deviceSerialNumber, sourceMo, targetMo, subMo, sizeNumber, quantity } = command

		const pendingExchangeEpcs = await this.ioMongoRepository.getPendingExchangeEpcs({
			deviceSerialNumber,
			manufacturingOrder: sourceMo,
			quantity
		})
		const targetExchangeMo = await this.ioMssqlRepository.getExchangeTargetMo(targetMo, subMo)
		const upsertEpcInfoTransaction = new UpsertEpcsMatchTransaction(pendingExchangeEpcs,targetExchangeMo,sizeNumber)
		const tx = upsertEpcInfoTransaction.startTransaction()
		await this.ioMssqlRepository.upsertEpcsMatch(tx.toDataArray())
		this.eventPublisher.mergeObjectContext(upsertEpcInfoTransaction)
		upsertEpcInfoTransaction.commit()
	}
}
