import { CheckOutInventoryAuditModel } from '@modules/inventory/domain/models/checkout-inventory-audit.model'
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
		const statuses = await this.inventoryAuditRepository.getInventoryAuditClosureStatus(command.month)
		const checkoutTx = new CheckOutInventoryAuditModel(command.month, statuses)
		checkoutTx.startTransaction()
		await this.inventoryAuditRepository.checkoutInventoryAudit(command.month)
		checkoutTx.commit()
	}
}
