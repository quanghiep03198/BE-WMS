import {
	InconsistentMoSizesException,
	InconsistentMoSpecsException,
	NoExchangableEpcException
} from '@/modules/inoutbound/domain/exceptions/mo-exchange-tx.exception'
import { MoExchangeTransaction } from '@/modules/inoutbound/domain/models/mo-exchange-transaction.model'
import { SizeNumber } from '@/modules/inoutbound/domain/value-objects/size-number.vo'
import { BadRequestException, Inject, NotFoundException } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../../ports/io-mongo.repository.port'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '../../../ports/io-mssql.repository.port'
import { ExchangeMoRmCommand } from '../impl/exchange-mo-rm.command'

@CommandHandler(ExchangeMoRmCommand)
export class ExchangeMoRmHandler implements ICommandHandler<ExchangeMoRmCommand> {
	constructor(
		@Inject(IO_MONGO_REPOSITORY) private readonly ioMongoRepository: IIoMongoRepository,
		@Inject(IO_MSSQL_REPOSITORY) private readonly ioMssqlRepository: IIoMssqlRepository,
		@InjectPinoLogger(ExchangeMoRmHandler.name) private readonly logger: PinoLogger,
		private readonly publisher: EventPublisher
	) {}

	public async execute({ deviceSerialNumber, sourceMos, targetMo }: ExchangeMoRmCommand): Promise<void> {
		try {
			const pendingExchangeData = await this.ioMongoRepository.getPendingExchangeMos(deviceSerialNumber, sourceMos)
			const exchangeTargetMo = await this.ioMssqlRepository.getExchangeTargetMo(targetMo)
			const moExchangeTransaction = new MoExchangeTransaction(
				pendingExchangeData.map((record) => ({
					...record,
					sizes: record.sizes.map((size) => new SizeNumber(size))
				})),
				{ ...exchangeTargetMo, sizes: exchangeTargetMo.sizes.map((size) => new SizeNumber(size)) }
			)
			moExchangeTransaction.verify()
			const pendingExchangeSkus = moExchangeTransaction.getPendingExchangeSkus()
			await this.ioMssqlRepository.exchangeManufacturingOrder(pendingExchangeSkus, targetMo)
			this.publisher.mergeObjectContext(moExchangeTransaction)
			moExchangeTransaction.commit()
		} catch (error) {
			if (error instanceof NoExchangableEpcException)
				throw new NotFoundException('No exchangeable EPCs found for the provided source MOs and target MO.')
			else if (error instanceof InconsistentMoSpecsException)
				throw new BadRequestException(
					'Inconsistent MO specifications detected. Please ensure that the source MOs and target MO are compatible for exchange.'
				)
			else if (error instanceof InconsistentMoSizesException)
				throw new BadRequestException(
					'Inconsistent MO sizes detected. Please ensure that the source MOs and target MO have compatible sizes for exchange.'
				)
			else throw error
		}
	}
}
