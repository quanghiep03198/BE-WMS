import { UpdateSupplementalQtyModel } from '@modules/inventory/domain/models/update-supplemental-qty.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { IInventoryAuditRepository, INVENTORY_AUDIT_REPOSITORY } from '../../ports/inventory-audit.repository.port'
import { UpdateInventorySupplementalQtyCommand } from './update-inventory-supplemental-qty.command'

@CommandHandler(UpdateInventorySupplementalQtyCommand)
export class UpdateInventorySupplementalQtyHandler implements ICommandHandler<UpdateInventorySupplementalQtyCommand> {
	constructor(
		@Inject(INVENTORY_AUDIT_REPOSITORY) private readonly inventoryAuditRepository: IInventoryAuditRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	public async execute({ filter, update, updatedBy }: UpdateInventorySupplementalQtyCommand) {
		const data = await this.inventoryAuditRepository.getMonthlyInventoryAudit(filter.year_month, [filter.mo_no])
		if (Array.isArray(data?.values) || data?.values?.length === 0) return
		const tx = new UpdateSupplementalQtyModel(filter.year_month, filter.mo_no, data.values[0].size_ledger, update, {
			username: updatedBy.username,
			display_name: updatedBy.display_name
		})
		const updatedSupplementalQty = tx.updateSupplementalQty()
		await this.inventoryAuditRepository.saveSupplementalQty(filter, updatedSupplementalQty, updatedBy._id)
		this.eventPublisher.mergeObjectContext(tx).commit()
	}
}
