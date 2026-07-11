import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import { UpdateStockInTimestampFailedEvent } from '@modules/finished-goods/domain/events/update-stock-in-timestamp-failed/update-stock-in-date-failed.event'
import { UpdateStockInTimestampSuccessEvent } from '@modules/finished-goods/domain/events/update-stock-in-timestamp-success/update-stock-in-timestamp-success.event'
import { InoutboundGateway } from '@modules/finished-goods/presentation/gateways/inoutbound.gateway'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { UpdateStockInTimestampCommand } from './update-stock-in-timestamp.command'

@CommandHandler(UpdateStockInTimestampCommand)
export class UpdateStockInTimestampHandler implements ICommandHandler<UpdateStockInTimestampCommand> {
	constructor(
		@InjectPinoLogger(UpdateStockInTimestampHandler.name) private readonly logger: PinoLogger,
		@Inject(IO_MONGO_REPOSITORY) private readonly inoutboundMongoRepository: IIoMongoRepository,
		private readonly eventBus: EventBus,
		private readonly i18nService: I18nService,
		private readonly inoutboundGateway: InoutboundGateway
	) {}

	public async execute({ scannedEpcs }: UpdateStockInTimestampCommand): Promise<void> {
		try {
			await this.inoutboundMongoRepository.updateInboundTimestamp(scannedEpcs)
			this.eventBus.publish(
				new UpdateStockInTimestampSuccessEvent({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
			)
			this.inoutboundGateway.server.emit(
				'inbound:success',
				this.i18nService.t('inoutbound.notification.stock_in_success', {
					lang: I18nContext.current()?.lang
				})
			)
		} catch (error) {
			this.logger.error(error)
			this.eventBus.publish(new UpdateStockInTimestampFailedEvent('WH101', scannedEpcs))
			this.inoutboundGateway.server.emit(
				'inbound:error',
				this.i18nService.t('inoutbound.notification.stock_in_failed', {
					lang: I18nContext.current()?.lang
				})
			)
			throw error
		}
	}
}
