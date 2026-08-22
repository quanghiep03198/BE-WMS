import { generateShortId } from '@common/utils/short-id.util'
import { AggregateRoot } from '@nestjs/cqrs'
import { entries, groupBy } from 'lodash'
import { RecalledFromStockEvent } from '../events/recalled-from-stock/recalled-from-stock.event'
import { InsufficientInventoryException } from '../exceptions/insufficient-inventory.exception'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'

export class RecallFromStockTransaction extends AggregateRoot {
	private readonly id: string = generateShortId()

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

	/**
	 * @description Initiates the recall-from-stock transaction by validating the incoming EPCs against the manufacturing order inventory. It checks if the recall order exceeds the available stock and applies the recalled-from-stock event if valid.
	 * @returns {string} `transactionId` - A unique identifier for the recall-from-stock transaction.
	 */
	public startTransaction(): string {
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

		return this.id
	}
}
