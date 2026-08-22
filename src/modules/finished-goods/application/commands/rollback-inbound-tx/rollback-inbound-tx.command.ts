import { Command } from '@nestjs/cqrs'

export class RollbackStockInTxCommand extends Command<void> {
	constructor(public readonly transactionId: string) {
		super()
	}
}
