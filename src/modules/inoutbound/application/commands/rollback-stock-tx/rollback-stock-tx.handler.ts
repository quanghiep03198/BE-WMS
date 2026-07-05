import {
	IIoMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@/modules/inoutbound/application/ports/io-mssql.repository.port'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { RollbackStockTransactionCommand } from './rollback-stock-tx.command'

@CommandHandler(RollbackStockTransactionCommand)
export class RollbackStockTransactionHandler implements ICommandHandler<RollbackStockTransactionCommand> {
	constructor(
		@InjectPinoLogger(RollbackStockTransactionCommand.name) private readonly logger: PinoLogger,
		@Inject(IO_MSSQL_REPOSITORY) private readonly inoutboundMssqlRepository: IIoMssqlRepository
	) {}

	public async execute({ stationNo: stationNO, scannedEpcs }: RollbackStockTransactionCommand): Promise<void> {
		this.logger.debug(`Rolling back stored EPCs: ${scannedEpcs.map((epc) => epc.getStockKeepingUnit()).join(', ')}`)
		await this.inoutboundMssqlRepository.rollbackInoutboundTransaction(stationNO, scannedEpcs)
	}
}
