import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '../../ports/io-mssql.repository.port'
import { RollbackExchangeMoTransactionCommand } from './rollback-exchange-mo-tx.command'

@CommandHandler(RollbackExchangeMoTransactionCommand)
export class RollbackExchangeMoTransactionHandler implements ICommandHandler<RollbackExchangeMoTransactionCommand> {
	constructor(@Inject(IO_MSSQL_REPOSITORY) private readonly ioMssqlRepository: IIoMssqlRepository) {}

	public async execute({ exchangedEpcs: exchangeSkus }: RollbackExchangeMoTransactionCommand) {
		await this.ioMssqlRepository.rollbackExchangeMoTransaction(exchangeSkus)
	}
}
