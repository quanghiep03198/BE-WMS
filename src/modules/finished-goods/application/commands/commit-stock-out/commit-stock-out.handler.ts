import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import { CommitStockInFailureEvent } from '@modules/finished-goods/domain/events/commit-stock-in-failure/commit-stock-in-failure.event'
import { CommittedStockOutEvent } from '@modules/finished-goods/domain/events/committed-stock-out/committed-stock-out.event'
import { FinishedGoodsGateway } from '@modules/finished-goods/presentation/gateways/inoutbound.gateway'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
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
			await this.inoutboundMongoRepository.stockOut(scannedEpcs)
			this.eventBus.publish(new CommittedStockOutEvent(scannedEpcs.length))
		} catch (error) {
			this.logger.error(error)
			this.eventBus.publish(new CommitStockInFailureEvent('WH103', scannedEpcs))

			throw error
		}
	}
}
