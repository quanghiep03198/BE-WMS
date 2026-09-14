import { Command } from '@nestjs/cqrs'

export class RollbackInboundTxCommand extends Command<void> {
	constructor(public readonly transactionId: string) {
		super()
	}
}
