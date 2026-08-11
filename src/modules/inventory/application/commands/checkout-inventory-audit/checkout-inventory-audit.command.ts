import { Command } from '@nestjs/cqrs'

export class CheckoutInventoryAuditCommand extends Command<void> {
	constructor(public readonly month: string) {
		super()
	}
}
