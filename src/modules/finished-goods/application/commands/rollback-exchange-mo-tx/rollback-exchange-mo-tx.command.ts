import { Command } from '@nestjs/cqrs'

export class RollbackExchangeMoTransactionCommand extends Command<void> {
	constructor(public readonly exchangedEpcs: Array<string>) {
		super()
	}
}
