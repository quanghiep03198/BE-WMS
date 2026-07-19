import { AggregateRoot } from '@nestjs/cqrs'
import { entries, groupBy } from 'lodash'
import { randomBytes } from 'node:crypto'
import { StockedInEvent } from '../events/stocked-in/stocked-in.event'
import { StockedOutEvent } from '../events/stocked-out/stocked-out.event'
import { ExcessInboundOrderException } from '../exceptions/excess-order.exception'
import { StockFlow } from '../types'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'

export class StockTransaction extends AggregateRoot {
	private readonly stockInTxId: string = randomBytes(8).toString('hex')
	private readonly stockOutTxId: string = randomBytes(8).toString('hex')

	constructor(
		private readonly stockFlow: StockFlow,
		private readonly pendingStockMoveEpcs: Array<ElectronicProductCode>,
		private readonly currentProgress: Array<{
			size_numcode: SizeNumber
			size_qty: number
			accumulated_qty: number
		}> = []
	) {
		super()
	}

	public get stockInTransactionId() {
		return this.stockInTxId
	}

	public get stockOutTransactionId() {
		return this.stockOutTxId
	}

	public startTransaction() {
		const transactionalSizeQty = entries(groupBy(this.pendingStockMoveEpcs, (epc) => epc.getSize())).map(
			([size, epcs]) => ({
				size_numcode: new SizeNumber(size),
				inbound_qty: epcs.length
			})
		)

		const outstandingOrderQty = this.currentProgress.map((inboundSizeDetail) => {
			const incomming = transactionalSizeQty.find((incoming) =>
				inboundSizeDetail.size_numcode.isEqual(incoming.size_numcode)
			)
			if (!incomming)
				return {
					size_numcode: inboundSizeDetail.size_numcode.getValue(),
					missing_qty: inboundSizeDetail.size_qty - inboundSizeDetail.accumulated_qty
				}
			return {
				size_numcode: inboundSizeDetail.size_numcode.getValue(),
				missing_qty: inboundSizeDetail.size_qty - inboundSizeDetail.accumulated_qty - incomming.inbound_qty
			}
		})

		const excessedOrderSizes = outstandingOrderQty.filter((size) => size.missing_qty < 0)

		const isOrderExcessed = excessedOrderSizes.length > 0

		if (isOrderExcessed) throw new ExcessInboundOrderException('', { cause: excessedOrderSizes })

		const domainEvent: Readonly<{ inbound: StockedInEvent; outbound: StockedOutEvent }> = {
			inbound: new StockedInEvent(this.stockInTxId, this.pendingStockMoveEpcs),
			outbound: new StockedOutEvent(this.stockOutTxId, this.pendingStockMoveEpcs)
		}

		this.apply(domainEvent[this.stockFlow])
	}
}
