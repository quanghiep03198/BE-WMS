import { ExchangeMoSuccessEvent } from '@/modules/inoutbound/domain/events/exchange-mo-success/exchange-mo-success.event'
import { UpsertEpcInfoTransaction } from '@/modules/inoutbound/domain/models/upsert-epc-info-transaction.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../ports/io-mongo.repository.port'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '../../ports/io-mssql.repository.port'
import { UpsertEpcInfoCommand } from './upsert-epc-info.command'

@CommandHandler(UpsertEpcInfoCommand)
export class UpsertEpcInfoHandler implements ICommandHandler<UpsertEpcInfoCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY)
		private readonly ioMongoRepository: IIoMongoRepository,
		@Inject(IO_MSSQL_REPOSITORY)
		private readonly ioMssqlRepository: IIoMssqlRepository
	) {}

	public async execute(command: UpsertEpcInfoCommand): Promise<void> {
		const pendingExchangeEpcs = await this.ioMongoRepository.getPendingExchangeEpcs({
			deviceSerialNumber: command.deviceSerialNumber,
			manufacturingOrder: command.sourceMo,
			sizeNumber: command.sizeNumber,
			quantity: command.quantity
		})

		const targetExchangeMo = await this.ioMssqlRepository.getExchangeTargetMo(command.targetMo)

		const upsertEpcInfoTransaction = new UpsertEpcInfoTransaction(pendingExchangeEpcs, targetExchangeMo)

		upsertEpcInfoTransaction.verify()

		await this.ioMssqlRepository.exchangeManufacturingOrder(
			upsertEpcInfoTransaction.getPendingExchangeEpcs(),
			upsertEpcInfoTransaction.getTargetMo()
		)

		upsertEpcInfoTransaction.apply(
			new ExchangeMoSuccessEvent(
				upsertEpcInfoTransaction.getPendingExchangeEpcs(),
				upsertEpcInfoTransaction.getTargetMo()
			)
		)

		upsertEpcInfoTransaction.commit()
	}
}
