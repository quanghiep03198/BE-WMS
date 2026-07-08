import { ExchangeMoSuccessEvent } from '@/modules/inoutbound/domain/events/exchange-mo-success/exchange-mo-success.event'
import {
	MismatchingMoSpecsException,
	MismatchingSizeNumberException,
	NoExchangableMoException
} from '@/modules/inoutbound/domain/exceptions/mo-exchange-tx.exception'
import { UpsertEpcInfoTransaction } from '@/modules/inoutbound/domain/models/upsert-epc-info-transaction.model'
import { BadRequestException, Inject } from '@nestjs/common'
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
		try {
			console.log('command', command)

			const pendingExchangeEpcs = await this.ioMongoRepository.getPendingExchangeEpcs({
				deviceSerialNumber: command.deviceSerialNumber,
				manufacturingOrder: command.sourceMo,
				sizeNumber: command.sizeNumber,
				quantity: command.quantity
			})

			const targetExchangeMo = await this.ioMssqlRepository.getExchangeTargetMo(command.targetMo, command.subMo)

			const upsertEpcInfoTransaction = new UpsertEpcInfoTransaction(pendingExchangeEpcs, targetExchangeMo)

			upsertEpcInfoTransaction.verify()

			this.logger.debug(upsertEpcInfoTransaction.getPendingExchangeEpcs())
			this.logger.debug(upsertEpcInfoTransaction.getTargetMo())

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
			this.eventPublisher.mergeObjectContext(upsertEpcInfoTransaction)
			upsertEpcInfoTransaction.commit()
		} catch (error) {
			if (error instanceof NoExchangableMoException)
				throw new BadRequestException('No exchangable manufacturing order found for the provided target MO.')
			else if (error instanceof MismatchingMoSpecsException)
				throw new BadRequestException('Inconsistent MO specifications between pending EPCs and target MO.')
			else if (error instanceof MismatchingSizeNumberException)
				throw new BadRequestException('Inconsistent MO sizes between pending EPCs and target MO.')
			else throw error
		}
	}
}
