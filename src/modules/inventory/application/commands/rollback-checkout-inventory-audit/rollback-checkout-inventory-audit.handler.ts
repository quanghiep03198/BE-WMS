import { CommandHandler } from '@nestjs/cqrs'
import { RollbackCheckoutInventoryAuditCommand } from './rollback-checkout-inventory-audit.command'

@CommandHandler(RollbackCheckoutInventoryAuditCommand)
export class RollbackCheckoutInventoryAuditHandler {
	public async execute(command: RollbackCheckoutInventoryAuditCommand) {
		// Implement the rollback logic here
	}
}
