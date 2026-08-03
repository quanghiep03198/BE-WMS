import { AggregateRoot } from '@nestjs/cqrs'
import { entries, groupBy } from 'lodash'
import { RecalledFromStockEvent } from '../events/recalled-from-stock/recalled-from-stock.event'
import { InsufficientInventoryException } from '../exceptions/insufficient-inventory.exception'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'

export class RecallFromStockTransaction extends AggregateRoot {
	constructor(
		public readonly pendingRecallEpcs: Array<ElectronicProductCode>,
		public readonly moInventory: Array<{
			size_numcode: SizeNumber
			order_qty: number
			accumulated_qty: number
		}> = []
	) {
		super()
	}

	public startTransaction() {
		const transactionalSizeQty = entries(groupBy(this.pendingRecallEpcs, (epc) => epc.getSize())).map(
			([size, epcs]) => ({
				size_numcode: new SizeNumber(size),
				recall_qty: epcs.length
			})
		)

		const inStockQty = this.moInventory.map((inboundSizeDetail) => {
			const incomming = transactionalSizeQty.find((incoming) =>
				inboundSizeDetail.size_numcode.isEqual(incoming.size_numcode)
			)
			if (!incomming)
				return {
					size_numcode: inboundSizeDetail.size_numcode.getValue(),
					instock_qty: inboundSizeDetail.accumulated_qty
				}
			return {
				size_numcode: inboundSizeDetail.size_numcode.getValue(),
				instock_qty: inboundSizeDetail.accumulated_qty - incomming.recall_qty
			}
		})

		const isInventoryInsufficient = inStockQty.some((size) => size.instock_qty < 0)

		if (isInventoryInsufficient)
			throw new InsufficientInventoryException('Insufficient inventory for recall', {
				cause: inStockQty.filter((size) => size.instock_qty < 0)
			})

		this.apply(new RecalledFromStockEvent(this.pendingRecallEpcs))
	}
}
