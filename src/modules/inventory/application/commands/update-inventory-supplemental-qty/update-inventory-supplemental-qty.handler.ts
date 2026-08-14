import { UpdateSupplementalQtyModel } from '@modules/inventory/domain/models/update-supplemental-qty.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IInventoryAuditRepository, INVENTORY_AUDIT_REPOSITORY } from '../../ports/inventory-audit.port.interface'
import { UpdateInventorySupplementalQtyCommand } from './update-inventory-supplemental-qty.command'

@CommandHandler(UpdateInventorySupplementalQtyCommand)
export class UpdateInventorySupplementalQtyHandler implements ICommandHandler<UpdateInventorySupplementalQtyCommand> {
	constructor(
		@Inject(INVENTORY_AUDIT_REPOSITORY) private readonly inventoryAuditRepository: IInventoryAuditRepository
	) {}

	public async execute({ filter, update }: UpdateInventorySupplementalQtyCommand) {
		const [moInventory] = await this.inventoryAuditRepository.getMonthlyInventoryAudit(filter.year_month, [
			filter.mo_no
		])
		const tx = new UpdateSupplementalQtyModel(moInventory.inventory_variation, update)
		const updatedSupplementalQty = tx.updateSupplementalQty()
		await this.inventoryAuditRepository.saveSupplementalQty(filter, updatedSupplementalQty)
	}
}
