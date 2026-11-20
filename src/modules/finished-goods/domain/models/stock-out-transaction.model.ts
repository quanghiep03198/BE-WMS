import { AggregateRoot } from '@nestjs/cqrs'
import { entries, groupBy } from 'lodash'
import join from 'lodash/join'
import { StockedOutEvent } from '../events/stocked-out/stocked-out.event'
import { ExcessOutboundOrderException } from '../exceptions/excess-order.exception'
import { InsufficientInventoryException } from '../exceptions/insufficient-inventory.exception'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'
import { isValidMoSizeProgress, type MoSizeProgress } from './mo-size-progress'

/**
 * Represents a transaction for shipping out goods, ensuring that the quantities being shipped do not exceed the purchase order requirements and that there is sufficient inventory available for the specified manufacturing orders.
 * @class ShipOutTransaction
 * @extends {AggregateRoot}
 * @tutorial
 */
export class StockOutTransaction extends AggregateRoot {
	constructor(
		private readonly pendingShipOutEpcs: Array<ElectronicProductCode>,
		private readonly poOutboundProgress: Array<{
			size_numcode: SizeNumber
			order_qty: number
			accumulated_qty: number
		}> = [],
		private readonly moInventories: Array<MoSizeProgress & { mo_no: string }>,
		private readonly id: string
	) {
		super()
	}

	public get shipOutTransactionId() {
		return this.id
	}

	/**
	 * @description Initiates the recall-from-stock transaction by validating the incoming EPCs against the manufacturing order inventory. It checks if the recall order exceeds the available stock and applies the recalled-from-stock event if valid.
	 * @returns {string} `transactionId` - A unique identifier for the recall-from-stock transaction.
	 */
	public startTransaction(): string {
		const transactionalSizeQty = entries(
			groupBy(this.pendingShipOutEpcs, (epc) => {
				const mo = epc.getManufacturingOrder()
				const size = epc.getSize()
				return join([mo, size], '/')
			})
		).map(([id, epcs]) => {
			const [mo_no, size] = id.split('/')
			return {
				mo_no,
				size_numcode: new SizeNumber(size),
				shipped_out_qty: epcs.length
			}
		})
		const transactionalPoSizeQty = entries(groupBy(this.pendingShipOutEpcs, (epc) => epc.getSize())).map(
			([size, epcs]) => ({
				size_numcode: new SizeNumber(size),
				shipped_out_qty: epcs.length
			})
		)

		const outstandingPurchaseOrderQty = this.poOutboundProgress.map((outboundSizeDetail) => {
			const tx = transactionalPoSizeQty.find((incoming) =>
				outboundSizeDetail.size_numcode.isEqual(incoming.size_numcode)
			)

			if (!tx)
				return {
					size_numcode: outboundSizeDetail.size_numcode.getValue(),
					missing_qty: outboundSizeDetail.order_qty - outboundSizeDetail.accumulated_qty
				}
			return {
				size_numcode: outboundSizeDetail.size_numcode.getValue(),
				missing_qty: outboundSizeDetail.order_qty - outboundSizeDetail.accumulated_qty - tx.shipped_out_qty
			}
		})

		const invalidMoSizes = transactionalSizeQty.flatMap(({ mo_no, size_numcode, shipped_out_qty }) => {
			const inventory = this.moInventories.find(
				(item) => item.mo_no === mo_no && item.size_numcode.isEqual(size_numcode)
			)
			if (isValidMoSizeProgress(inventory, 0, shipped_out_qty)) return []

			return [
				{
					mo_no,
					size_numcode: size_numcode.getValue(),
					xf_deficit: (inventory?.instock_qty ?? 0) - shipped_out_qty
				}
			]
		})

		const excessedSizingOrder = outstandingPurchaseOrderQty.filter((size) => size.missing_qty < 0)

		const isOrderExcessed = excessedSizingOrder.length > 0

		if (isOrderExcessed)
			throw new ExcessOutboundOrderException('Outbound order already excessed', { cause: excessedSizingOrder })

		if (invalidMoSizes.length)
			throw new InsufficientInventoryException('MO size inventory or order limit violated for ship-out', {
				cause: invalidMoSizes
			})

		this.apply(new StockedOutEvent(this.pendingShipOutEpcs))

		return this.id
	}
}
