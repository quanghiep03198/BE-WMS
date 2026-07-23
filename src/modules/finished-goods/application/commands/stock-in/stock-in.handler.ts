import {
	IIoMongoRepository,
	IO_MONGO_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mongo.repository.port'
import {
	IIoMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mssql.repository.port'
import { StockTransaction } from '@modules/finished-goods/domain/models/stock-transaction.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { StockInCommand } from './stock-in.command'

@CommandHandler(StockInCommand)
export class StockInHandler implements ICommandHandler<StockInCommand> {
	constructor(
		@Inject(IO_MSSQL_REPOSITORY) private readonly inoutboundMssqlRepository: IIoMssqlRepository,
		@Inject(IO_MONGO_REPOSITORY) private readonly inoutboundMongoRepository: IIoMongoRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ command }: StockInCommand): Promise<void> {
		const pendingInboundEpcs = await this.inoutboundMongoRepository.getPendingInboundEpcs(
			command.inbound_device_sn,
			command.mo_no,
			`${command.dept_code}/${command.dept_name}`,
			command.storage
		)
		const currentInboundProgress = await this.inoutboundMssqlRepository.getMoInboundProgress(
			command.mo_no,
			pendingInboundEpcs
		)
		// * Start Unit of Work transaction for inbound stock-in process
		const inboundTransaction = new StockTransaction('inbound', pendingInboundEpcs, currentInboundProgress)
		inboundTransaction.startTransaction()

		await this.inoutboundMongoRepository.commitStockIn(pendingInboundEpcs)

		this.eventPublisher.mergeObjectContext(inboundTransaction)
		inboundTransaction.commit()
	}
}
