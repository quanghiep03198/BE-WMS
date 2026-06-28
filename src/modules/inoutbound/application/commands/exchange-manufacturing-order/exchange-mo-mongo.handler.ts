import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ExchangeMoMssqlCommand } from './exchange-mo-mssql.command'

@CommandHandler(ExchangeMoMssqlCommand)
export class ExchangeMoMongoHandler implements ICommandHandler<ExchangeMoMssqlCommand> {
	constructor() {}

	public async execute(command: ExchangeMoMssqlCommand): Promise<void> {}
}
