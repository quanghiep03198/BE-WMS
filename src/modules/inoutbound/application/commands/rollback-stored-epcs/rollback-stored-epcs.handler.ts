import {
	IInoutboundMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/io-mssql.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { RollbackStoredEpcsCommand } from './rollback-stored-epcs.command'

@CommandHandler(RollbackStoredEpcsCommand)
export class RollbackStoredEpcsHandler implements ICommandHandler<RollbackStoredEpcsCommand> {
	constructor(
		@InjectPinoLogger(RollbackStoredEpcsHandler.name) private readonly logger: PinoLogger,
		@Inject(IO_MSSQL_REPOSITORY) private readonly inoutboundMssqlRepository: IInoutboundMssqlRepository
	) {}

	public async execute({ scannedEpcs }: RollbackStoredEpcsCommand): Promise<void> {
		this.logger.debug(`Rolling back stored EPCs: ${scannedEpcs.map((epc) => epc.getStockKeepingUnit()).join(', ')}`)
		await this.inoutboundMssqlRepository.rollbackStoredEpcs(scannedEpcs)
	}
}
