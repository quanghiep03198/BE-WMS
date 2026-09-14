import { Command } from '@nestjs/cqrs'

export class RollbackOutboundTxCommand extends Command<void> {
	constructor(public readonly transactionId: string) {
		super()
	}
}
