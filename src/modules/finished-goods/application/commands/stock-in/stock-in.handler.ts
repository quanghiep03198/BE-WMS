import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import {
	IIoMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mssql.repository.port'
import { StockedInEvent } from '@modules/finished-goods/domain/events/stocked-in/stocked-in.event'
import { ExcessInboundOrderException } from '@modules/finished-goods/domain/exceptions/excess-order.exception'
import { StockTransaction } from '@modules/finished-goods/domain/models/stock-transaction.model'
import { BadRequestException, Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { StockInCommand } from './stock-in.command'

@CommandHandler(StockInCommand)
export class StockInHandler implements ICommandHandler<StockInCommand> {
	constructor(
		private readonly i18nService: I18nService,
		@Inject(IO_MSSQL_REPOSITORY) private readonly inoutboundMssqlRepository: IIoMssqlRepository,
		@Inject(IO_MONGO_REPOSITORY) private readonly inoutboundMongoRepository: IIoMongoRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ command }: StockInCommand): Promise<void> {
		try {
			const pendingInboundEpcs = await this.inoutboundMongoRepository.getPendingInboundEpcs(
				command.inbound_device_sn,
				command.mo_no
			)

			const currentInboundProgress = await this.inoutboundMssqlRepository.getMoInboundProgress(
				command.mo_no,
				pendingInboundEpcs
			)
			// * Create a new StockInTransaction instance to handle the stock-in process
			const inboundTransaction = new StockTransaction('inbound', pendingInboundEpcs, currentInboundProgress)
			const inboundEpcs = inboundTransaction.verify()

			// * Perform the stock-in operation in the Single Source of Truth (MSSQL) database
			await this.inoutboundMssqlRepository.stockIn(inboundEpcs, command)

			// * Apply the StockedInEvent to the transaction and commit it
			inboundTransaction.apply(new StockedInEvent(inboundEpcs))
			this.eventPublisher.mergeObjectContext(inboundTransaction)
			inboundTransaction.commit()
		} catch (error) {
			let message: string = this.i18nService.t('inoutbound.notification.stock_in_failed', {
				lang: I18nContext.current()?.lang
			})
			if (error instanceof ExcessInboundOrderException) {
				message = this.i18nService.t('inoutbound.notification.over_inbound_limit', {
					lang: I18nContext.current()?.lang
				})
				throw new BadRequestException(message, { cause: error.cause })
			}

			throw error
		}
	}
}
