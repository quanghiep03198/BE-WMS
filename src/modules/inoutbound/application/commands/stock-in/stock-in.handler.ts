import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@/modules/inoutbound/application/ports/io-mongo.repository.port'
import {
	IIoMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@/modules/inoutbound/application/ports/io-mssql.repository.port'
import { StockedInEvent } from '@/modules/inoutbound/domain/events/stocked-in/stocked-in.event'
import { ExcessInboundOrderException } from '@/modules/inoutbound/domain/exceptions/excess-inbound-order.exception'
import { StockInTransaction } from '@/modules/inoutbound/domain/models/stock-in-transaction.model'
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

			const inboundTransaction = new StockInTransaction(pendingInboundEpcs, currentInboundProgress)

			const inboundEpcs = inboundTransaction.verify(pendingInboundEpcs)

			await this.inoutboundMssqlRepository.stockIn(inboundEpcs, command)

			inboundTransaction.apply(new StockedInEvent(inboundEpcs))
			this.eventPublisher.mergeObjectContext(inboundTransaction)
			inboundTransaction.commit()
		} catch (error) {
			if (error instanceof ExcessInboundOrderException)
				throw new BadRequestException(
					this.i18nService.t('inoutbound.notification.over_inbound_limit', { lang: I18nContext.current()?.lang }),
					{ cause: error.cause }
				)

			throw error
		}
	}
}
