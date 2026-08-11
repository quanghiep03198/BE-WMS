import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IInventoryAuditRepository, INVENTORY_AUDIT_REPOSITORY } from '../../ports/inventory-audit.port.interface'
import { CheckoutInventoryAuditCommand } from './checkout-inventory-audit.command'

@CommandHandler(CheckoutInventoryAuditCommand)
export class CheckoutInventoryAuditHandler implements ICommandHandler<CheckoutInventoryAuditCommand> {
	constructor(
		@Inject(INVENTORY_AUDIT_REPOSITORY) private readonly inventoryAuditRepository: IInventoryAuditRepository
	) {}

	public async execute(command: CheckoutInventoryAuditCommand) {
		await this.inventoryAuditRepository.checkoutInventoryAudit(command.month)
	}
}
