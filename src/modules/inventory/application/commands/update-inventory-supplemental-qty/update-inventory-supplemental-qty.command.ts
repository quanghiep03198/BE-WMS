import { Command } from '@nestjs/cqrs'

export class UpdateInventorySupplementalQtyCommand extends Command<void> {
	constructor(
		public readonly filter: { year_month: string; mo_no: string },
		public readonly update: Array<{
			size_numcode: string
			supplemental_stocked_in_qty: number
			supplemental_shipped_out_qty: number
		}>
	) {
		super()
	}
}
