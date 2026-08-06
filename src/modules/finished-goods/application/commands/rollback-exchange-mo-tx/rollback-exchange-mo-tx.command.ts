import { Command } from '@nestjs/cqrs'

/**
 * @deprecated
 */
export class RollbackExchangeMoTransactionCommand extends Command<void> {
	constructor(public readonly exchangedEpcs: Array<string>) {
		super()
	}
}
