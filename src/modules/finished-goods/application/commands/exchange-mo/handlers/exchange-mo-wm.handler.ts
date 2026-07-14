import { ExchangeMoFailedEvent } from '@modules/finished-goods/domain/events/exchange-mo-failed/exchange-mo-failed.event'
import { FinishedGoodsGateway } from '@modules/finished-goods/presentation/gateways/inoutbound.gateway'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../../ports/io-mongo.repository.port'
import { ExchangeMoWmCommand } from '../impl/exchange-mo-wm.command'

@CommandHandler(ExchangeMoWmCommand)
export class ExchangeMoWmHandler implements ICommandHandler<ExchangeMoWmCommand> {
	constructor(
		@InjectPinoLogger(ExchangeMoWmHandler.name) private readonly logger: PinoLogger,
		@Inject(IO_MONGO_REPOSITORY) private readonly ioMongoRepository: IIoMongoRepository,
		private readonly i18nService: I18nService,
		private readonly finishedGoodsGateway: FinishedGoodsGateway,
		private readonly eventBus: EventBus
	) {}

	public async execute(command: ExchangeMoWmCommand): Promise<void> {
		try {
			await this.ioMongoRepository.exchangeMo(command.pendingExchangeSkus, command.targetMo)
			this.finishedGoodsGateway.server.emit(
				'exchange_mo:success',
				this.i18nService.t('inoutbound.notification.exchange_mo_success', { lang: I18nContext.current()?.lang })
			)
		} catch (error) {
			this.logger.error(error)
			this.finishedGoodsGateway.server.emit(
				'exchange_mo:error',
				this.i18nService.t('inoutbound.notification.exchange_mo_failed', { lang: I18nContext.current()?.lang })
			)
			this.eventBus.publish(new ExchangeMoFailedEvent(command.pendingExchangeSkus, command.targetMo))
		}
	}
}
