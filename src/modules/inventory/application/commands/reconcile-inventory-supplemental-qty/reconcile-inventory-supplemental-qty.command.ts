import { IUser } from '@modules/user/domain/interfaces'
import { Command } from '@nestjs/cqrs'

export class ReconcileInventorySupplementalQtyCommand extends Command<void> {
	constructor(
		public readonly yearMonth: string,
		public readonly manufacturingOrder: string,
		public readonly update: Array<{
			size_numcode: string
			supplemental_stocked_in_qty: number
			supplemental_shipped_out_qty: number
		}>,
		public readonly updatedBy: Pick<IUser, 'username' | 'display_name'>
	) {
		super()
	}
}
