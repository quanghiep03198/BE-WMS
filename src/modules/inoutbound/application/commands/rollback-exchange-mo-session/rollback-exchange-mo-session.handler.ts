import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RollbackExchangeMoSessionCommand } from './rollback-exchange-mo-session.command'

@CommandHandler(RollbackExchangeMoSessionCommand)
export class RollbackExchangeMoSessionHandler implements ICommandHandler<RollbackExchangeMoSessionCommand> {
	constructor() {}

	public async execute() {}
}
