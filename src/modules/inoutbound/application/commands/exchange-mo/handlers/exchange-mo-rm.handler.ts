import { ExchangeMoSuccessEvent } from '@modules/inoutbound/domain/events/exchange-mo-success/exchange-mo-success.event'
import {
	MismatchingMoSpecsException,
	MismatchingSizeNumberException,
	NoExchangableEpcException
} from '@modules/inoutbound/domain/exceptions/mo-exchange-tx.exception'
import { MoExchangeTransaction } from '@modules/inoutbound/domain/models/mo-exchange-transaction.model'
import { SizeNumber } from '@modules/inoutbound/domain/value-objects/size-number.vo'
import { InoutboundGateway } from '@modules/inoutbound/presentation/gateways/inoutbound.gateway'
import { HttpException, HttpStatus, Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
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
		private readonly inoutboundGateway: InoutboundGateway,
		private readonly i18nService: I18nService,
		private readonly publisher: EventPublisher
	) {}

	public async execute({ deviceSerialNumber, sourceMos, targetMo }: ExchangeMoRmCommand): Promise<void> {
		try {
			const pendingExchangeData = await this.ioMongoRepository.getPendingExchangeMos(deviceSerialNumber, sourceMos)
			const exchangeTargetMo = await this.ioMssqlRepository.getExchangeTargetMo(targetMo)
			// * Create a new instance of MoExchangeTransaction with the pending exchange data and target MO information
			const moExchangeTransaction = new MoExchangeTransaction(
				pendingExchangeData.map((record) => ({
					...record,
					sizes: record.sizes.map((size) => new SizeNumber(size))
				})),
				{ ...exchangeTargetMo, sizes: exchangeTargetMo.sizes.map((size) => new SizeNumber(size)) }
			)
			// * Validate the transaction and get the pending exchange SKUs
			const pendingExchangeSkus = moExchangeTransaction.validate()
			await this.ioMssqlRepository.exchangeManufacturingOrder(pendingExchangeSkus, targetMo)
			moExchangeTransaction.apply(new ExchangeMoSuccessEvent(pendingExchangeSkus, targetMo))
			this.publisher.mergeObjectContext(moExchangeTransaction)
			moExchangeTransaction.commit()
		} catch (error) {
			let message: string = this.i18nService.t('inoutbound.notification.exchange_mo_failed', {
				lang: I18nContext.current()?.lang
			})

			if (error instanceof Error) {
				this.inoutboundGateway.server.emit('exchange_mo:error', message)
				throw error
			}
			this.inoutboundGateway.server.emit('exchange_mo:error', message)

			let status: HttpStatus

			switch (true) {
				case error instanceof NoExchangableEpcException: {
					message = this.i18nService.t('inoutbound.notification.no_exchangable_sku', {
						lang: I18nContext.current()?.lang
					})
					status = HttpStatus.NOT_FOUND
					break
				}
				case error instanceof MismatchingMoSpecsException: {
					message = this.i18nService.t('inoutbound.notification.mismatching_mo_specs', {
						lang: I18nContext.current()?.lang
					})
					status = HttpStatus.BAD_REQUEST
					break
				}
				case error instanceof MismatchingSizeNumberException: {
					message = this.i18nService.t('inoutbound.notification.mismatching_size', {
						lang: I18nContext.current()?.lang
					})
					status = HttpStatus.BAD_REQUEST
					break
				}
			}

			this.inoutboundGateway.server.emit('exchange_mo:error', message)
			throw new HttpException(message, status)
		}
	}
}
