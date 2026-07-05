import { Command } from '@nestjs/cqrs'

export class RollbackExchangeMoTransactionCommand extends Command<any> {
	constructor(public readonly exchangedEpcs: Array<string>) {
		super()
	}
}
