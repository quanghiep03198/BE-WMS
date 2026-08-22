import { AggregateRoot } from '@nestjs/cqrs'
import { flatten } from 'flat'
import { SupplementalQtyExcessException } from '../exceptions'

export class UpdateSupplementalQtyModel extends AggregateRoot {
	constructor(
		private readonly fluctuation: Array<{
			size_numcode: string
			order_qty: number
			beginning_inventory_qty: number
			stocked_in_qty: number
			shipped_out_qty: number
			supplemental_stocked_in_qty: number
			supplemental_shipped_out_qty: number
			final_inventory_qty: number
		}>,
		private readonly update: Array<{
			size_numcode: string
			supplemental_stocked_in_qty: number
			supplemental_shipped_out_qty: number
		}>
	) {
		super()
	}

	updateSupplementalQty(): Record<
		`size_ledger.${string}.supplemental_stocked_in_qty` | `size_ledger.${string}.supplemental_shipped_out_qty`,
		number
	> {
		const updateMap = new Map(this.update.map((item) => [item.size_numcode, item]))

		const updateExpression = this.fluctuation.map((item) => ({
			...item,
			supplemental_stocked_in_qty:
				updateMap.get(item.size_numcode)?.supplemental_stocked_in_qty ?? item.supplemental_stocked_in_qty,
			supplemental_shipped_out_qty:
				updateMap.get(item.size_numcode)?.supplemental_shipped_out_qty ?? item.supplemental_shipped_out_qty
		}))

		const isOrderExcessed = updateExpression.some(
			(update) =>
				update.order_qty - update.stocked_in_qty - update.supplemental_stocked_in_qty < 0 ||
				update.order_qty - update.shipped_out_qty - update.supplemental_shipped_out_qty < 0
		)

		if (isOrderExcessed) throw new SupplementalQtyExcessException()

		return flatten({
			size_ledger: updateExpression.reduce((acc, curr) => {
				return {
					...acc,
					[curr.size_numcode]: {
						supplemental_stocked_in_qty: curr.supplemental_stocked_in_qty,
						supplemental_shipped_out_qty: curr.supplemental_shipped_out_qty
					}
				}
			}, {})
		})
	}
}
