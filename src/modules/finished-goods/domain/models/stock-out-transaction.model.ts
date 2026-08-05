import { AggregateRoot } from '@nestjs/cqrs'
import { entries, groupBy } from 'lodash'
import join from 'lodash/join'
import { randomBytes } from 'node:crypto'
import { StockedOutEvent } from '../events/stocked-out/stocked-out.event'
import { ExcessOutboundOrderException } from '../exceptions/excess-order.exception'
import { InsufficientInventoryException } from '../exceptions/insufficient-inventory.exception'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'

/**
 * Represents a transaction for shipping out goods, ensuring that the quantities being shipped do not exceed the purchase order requirements and that there is sufficient inventory available for the specified manufacturing orders.
 * @class ShipOutTransaction
 * @extends {AggregateRoot}
 * @tutorial
 */
export class StockOutTransaction extends AggregateRoot {
	private readonly stockOutTransaction: string = randomBytes(8).toString('hex')

	constructor(
		private readonly pendingShipOutEpcs: Array<ElectronicProductCode>,
		private readonly poOutboundProgress: Array<{
			size_numcode: SizeNumber
			order_qty: number
			accumulated_qty: number
		}> = [],
		private readonly moInventories: Array<{
			mo_no: string
			size_numcode: SizeNumber
			order_qty: number
			accumulated_qty: number
		}>
	) {
		super()
	}

	public get shipOutTransactionId() {
		return this.stockOutTransaction
	}

	public startTransaction() {
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
				outbound_qty: epcs.length
			}
		})

		const outstandingPurchaseOrderQty = this.poOutboundProgress.map((outboundSizeDetail) => {
			const tx = transactionalSizeQty.find((incoming) =>
				outboundSizeDetail.size_numcode.isEqual(incoming.size_numcode)
			)
			if (!tx)
				return {
					size_numcode: outboundSizeDetail.size_numcode.getValue(),
					missing_qty: outboundSizeDetail.order_qty - outboundSizeDetail.accumulated_qty
				}
			return {
				size_numcode: outboundSizeDetail.size_numcode.getValue(),
				missing_qty: outboundSizeDetail.order_qty - outboundSizeDetail.accumulated_qty - tx.outbound_qty
			}
		})

		const outStandingManufaturingOrderQty = this.moInventories.map((inventory) => {
			const tx = transactionalSizeQty.find((incoming) => {
				return inventory.mo_no === incoming.mo_no && inventory.size_numcode.isEqual(incoming.size_numcode)
			})

			if (!tx)
				return {
					mo_no: inventory.mo_no,
					size_numcode: inventory.size_numcode.getValue(),
					xf_deficit: inventory.accumulated_qty
				}

			return {
				mo_no: inventory.mo_no,
				size_numcode: inventory.size_numcode.getValue(),
				xf_deficit: inventory.accumulated_qty - tx.outbound_qty
			}
		})

		console.log('outStandingManufaturingOrderQty :>>', outStandingManufaturingOrderQty)

		const excessedSizingOrder = outstandingPurchaseOrderQty.filter((size) => size.missing_qty < 0)

		const isOrderExcessed = excessedSizingOrder.length > 0

		if (isOrderExcessed)
			throw new ExcessOutboundOrderException('Outbound order already excessed', { cause: excessedSizingOrder })

		const isInventoryInsufficient = outStandingManufaturingOrderQty.some((size) => size.xf_deficit < 0)
		if (isInventoryInsufficient)
			throw new InsufficientInventoryException('Insufficient inventory for ship-out', {
				cause: outStandingManufaturingOrderQty.filter((size) => size.xf_deficit < 0)
			})

		this.apply(new StockedOutEvent(this.stockOutTransaction, this.pendingShipOutEpcs))
	}
}
