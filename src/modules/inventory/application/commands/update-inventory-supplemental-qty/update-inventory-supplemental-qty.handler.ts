import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IInventoryAuditRepository, INVENTORY_AUDIT_REPOSITORY } from '../../ports/inventory-audit.port.interface'
import { UpdateInventorySupplementalQtyCommand } from './update-inventory-supplemental-qty.command'

@CommandHandler(UpdateInventorySupplementalQtyCommand)
export class UpdateInventorySupplementalQtyHandler implements ICommandHandler<UpdateInventorySupplementalQtyCommand> {
	constructor(
		@Inject(INVENTORY_AUDIT_REPOSITORY) private readonly inventoryAuditRepository: IInventoryAuditRepository
	) {}

	public async execute(command: UpdateInventorySupplementalQtyCommand) {
		await this.inventoryAuditRepository.updateInventorySupplementalQty(command.filter, command.update)
	}
}
