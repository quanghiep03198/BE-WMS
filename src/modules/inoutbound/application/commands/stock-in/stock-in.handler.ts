import { StockedInEvent } from '@/modules/inoutbound/domain/events/stocked-in/stocked-in.event'
import {
	IInoutboundMongoRepository,
	IO_MONGO_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/io-mongo.repository.interface'
import {
	IInoutboundMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/io-mssql.repository.interface'
import { BadRequestException, Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { StockInCommand } from './stock-in.command'

@CommandHandler(StockInCommand)
export class StockInHandler implements ICommandHandler<StockInCommand> {
	constructor(
		private readonly i18nService: I18nService,
		@Inject(IO_MSSQL_REPOSITORY) private readonly inoutboundMssqlRepository: IInoutboundMssqlRepository,
		@Inject(IO_MONGO_REPOSITORY) private readonly inoutboundMongoRepository: IInoutboundMongoRepository,
		private readonly eventBus: EventBus
	) {}

	// @Transactional(DATA_SOURCE_DATA_LAKE)
	public async execute({ command }: StockInCommand): Promise<void> {
		const payload = await this.inoutboundMongoRepository.getAllScanningEpcsByOrder(
			command.inbound_device_sn,
			command.mo_no
		)

		const excessInboundQuantities = await this.inoutboundMssqlRepository.getExcessInboundQuantities(
			command.mo_no,
			payload
		)

		if (excessInboundQuantities.length > 0)
			throw new BadRequestException(
				this.i18nService.t('inoutbound.notification.over_inbound_limit', { lang: I18nContext.current()?.lang }),
				{ cause: excessInboundQuantities }
			)

		await this.inoutboundMssqlRepository.stockIn(payload, command)

		await this.eventBus.publish(new StockedInEvent(payload))
	}
}
