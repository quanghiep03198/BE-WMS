import { Logger } from '@nestjs/common'
import { AggregateRoot } from '@nestjs/cqrs'
import { entries, groupBy } from 'lodash'
import { StockedInEvent } from '../events/stocked-in/stocked-in.event'
import { ExcessInboundOrderException } from '../exceptions/excess-order.exception'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'

export class StockInTransaction extends AggregateRoot {
	private readonly logger = new Logger(StockInTransaction.name)

	constructor(
		private readonly pendingInStockEpcs: Array<ElectronicProductCode>,
		private readonly moInventory: Array<{
			size_numcode: SizeNumber
			order_qty: number
			instock_qty: number
		}> = [],
		private readonly id: string
	) {
		super()
	}

	/**
	 * @description Initiates the stock-in transaction by validating the incoming EPCs against the manufacturing order inventory. It checks if the inbound order exceeds the limit and applies the stock-in event if valid.
	 * @returns {string} `transactionId` - A unique identifier for the stock-in transaction.
	 */
	public startTransaction() {
		const transactionalSizeQty = entries(groupBy(this.pendingInStockEpcs, (epc) => epc.getSize())).map(
			([size, epcs]) => ({
				size_numcode: new SizeNumber(size),
				inbound_qty: epcs.length
			})
		)
		this.logger.debug(this.moInventory)

		const outstandingOrderQty = this.moInventory.map((inboundSizeDetail) => {
			const tx = transactionalSizeQty.find((incoming) =>
				inboundSizeDetail.size_numcode.isEqual(incoming.size_numcode)
			)
			if (!tx)
				return {
					size_numcode: inboundSizeDetail.size_numcode.getValue(),
					missing_qty: inboundSizeDetail.order_qty - inboundSizeDetail.instock_qty
				}
			return {
				size_numcode: inboundSizeDetail.size_numcode.getValue(),
				missing_qty: inboundSizeDetail.order_qty - inboundSizeDetail.instock_qty - tx.inbound_qty
			}
		})

		const excessedOrderSizes = outstandingOrderQty.filter((size) => size.missing_qty < 0)

		const isOrderExcessed = excessedOrderSizes.length > 0

		if (isOrderExcessed) throw new ExcessInboundOrderException('', { cause: excessedOrderSizes })

		this.apply(new StockedInEvent(this.pendingInStockEpcs))

		return this.id
	}
}
