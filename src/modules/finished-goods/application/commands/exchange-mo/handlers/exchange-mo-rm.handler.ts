import { MoExchangeTransaction } from '@modules/finished-goods/domain/models/mo-exchange-transaction.model'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../../ports/io-mongo.repository.port'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '../../../ports/io-mssql.repository.port'
import { ExchangeMoRmCommand } from '../impl/exchange-mo-rm.command'

@CommandHandler(ExchangeMoRmCommand)
export class ExchangeMoRmHandler implements ICommandHandler<ExchangeMoRmCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY) private readonly ioMongoRepository: IIoMongoRepository,
		@Inject(IO_MSSQL_REPOSITORY) private readonly ioMssqlRepository: IIoMssqlRepository,
		private readonly publisher: EventPublisher
	) {}

	public async execute({ deviceSerialNumber, sourceMos, targetMo }: ExchangeMoRmCommand): Promise<void> {
		const pendingExchangeData = await this.ioMongoRepository.getPendingExchangeMos(deviceSerialNumber, sourceMos)
		const exchangeTargetMo = await this.ioMssqlRepository.getManufacturingOrder(targetMo)

		// * Create a new instance of MoExchangeTransaction with the pending exchange data and target MO information
		const moExchangeTransaction = new MoExchangeTransaction(
			pendingExchangeData.map((record) => ({
				...record,
				sizes: record.sizes.map((size) => new SizeNumber(size))
			})),
			{ ...exchangeTargetMo, sizes: exchangeTargetMo.sizes.map(({ size_numcode }) => new SizeNumber(size_numcode)) }
		)
		// * Validate the transaction and get the pending exchange SKUs
		const pendingExchangeSkus = moExchangeTransaction.startTransaction()
		await this.ioMssqlRepository.exchangeManufacturingOrder(pendingExchangeSkus, targetMo)

		this.publisher.mergeObjectContext(moExchangeTransaction)
		moExchangeTransaction.commit()
	}
}
