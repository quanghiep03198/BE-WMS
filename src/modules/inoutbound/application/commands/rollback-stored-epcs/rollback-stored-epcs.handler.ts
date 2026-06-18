import {
	IInoutboundMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/io-mssql.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RollbackStoredEpcsCommand } from './rollback-stored-epcs.command'

@CommandHandler(RollbackStoredEpcsCommand)
export class RollbackStoredEpcsHandler implements ICommandHandler<RollbackStoredEpcsCommand> {
	constructor(@Inject(IO_MSSQL_REPOSITORY) private readonly inoutboundMssqlRepository: IInoutboundMssqlRepository) {}

	public async execute({ scannedEpcs }: RollbackStoredEpcsCommand): Promise<void> {
		await this.inoutboundMssqlRepository.rollbackStoredEpcs(scannedEpcs)
	}
}
