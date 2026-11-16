import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ReconcileInventorySupplementalQtyCommand } from './reconcile-inventory-supplemental-qty.command'

@CommandHandler(ReconcileInventorySupplementalQtyCommand)
export class ReconcileInventorySupplementalQtyHandler implements ICommandHandler<ReconcileInventorySupplementalQtyCommand> {
	constructor() {}

	async execute(command: ReconcileInventorySupplementalQtyCommand) {}
}
