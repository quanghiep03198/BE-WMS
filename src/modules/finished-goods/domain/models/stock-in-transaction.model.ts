import { AggregateRoot } from '@nestjs/cqrs'
import { entries, groupBy } from 'lodash'
import { StockedInEvent } from '../events/stocked-in/stocked-in.event'
import { ExcessInboundOrderException } from '../exceptions/excess-order.exception'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'
import { isValidMoSizeProgress, type MoSizeProgress } from './mo-size-progress'

export class StockInTransaction extends AggregateRoot {
	constructor(
		private readonly pendingInStockEpcs: Array<ElectronicProductCode>,
		private readonly moInventory: MoSizeProgress[] = [],
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
		const excessedOrderSizes = transactionalSizeQty.flatMap(({ size_numcode, inbound_qty }) => {
			const progress = this.moInventory.find((item) => item.size_numcode.isEqual(size_numcode))
			if (isValidMoSizeProgress(progress, inbound_qty)) return []

			return [
				{
					size_numcode: size_numcode.getValue(),
					missing_qty:
						progress && Number.isFinite(progress.order_qty)
							? progress.order_qty - progress.instock_qty - progress.shipped_out_qty - inbound_qty
							: -inbound_qty
				}
			]
		})
		if (excessedOrderSizes.length) throw new ExcessInboundOrderException('', { cause: excessedOrderSizes })

		this.apply(new StockedInEvent(this.pendingInStockEpcs))

		return this.id
	}
}
