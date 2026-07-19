import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import { UpdateStockInTimestampFailedEvent } from '@modules/finished-goods/domain/events/update-stock-in-timestamp-failed/update-stock-in-date-failed.event'
import { UpdateStockInTimestampSuccessEvent } from '@modules/finished-goods/domain/events/update-stock-in-timestamp-success/update-stock-in-timestamp-success.event'
import { FinishedGoodsGateway } from '@modules/finished-goods/presentation/gateways/inoutbound.gateway'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CommitStockOutCommand } from './commit-stock-out.command'

@CommandHandler(CommitStockOutCommand)
export class CommitStockOutHandler implements ICommandHandler<CommitStockOutCommand> {
	constructor(
		@InjectPinoLogger(CommitStockOutHandler.name) private readonly logger: PinoLogger,
		@Inject(IO_MONGO_REPOSITORY) private readonly inoutboundMongoRepository: IIoMongoRepository,
		private readonly eventBus: EventBus,
		private readonly i18nService: I18nService,
		private readonly finishedGoodsGateway: FinishedGoodsGateway
	) {}

	public async execute({ scannedEpcs }: CommitStockOutCommand): Promise<void> {
		try {
			await this.inoutboundMongoRepository.commitStockOut(scannedEpcs)
			this.eventBus.publish(
				new UpdateStockInTimestampSuccessEvent({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
			)
			this.finishedGoodsGateway.server.emit(
				'finished_goods:outbound:success',
				this.i18nService.t('inoutbound.notification.stock_out_success', {
					args: { quantity: scannedEpcs.length },
					lang: I18nContext.current()?.lang
				})
			)
		} catch (error) {
			this.logger.error(error)
			this.eventBus.publish(new UpdateStockInTimestampFailedEvent('WH103', scannedEpcs))
			this.finishedGoodsGateway.server.emit(
				'finished_goods:outbound:error',
				this.i18nService.t('inoutbound.notification.stock_out_failed', {
					lang: I18nContext.current()?.lang
				})
			)
			throw error
		}
	}
}
