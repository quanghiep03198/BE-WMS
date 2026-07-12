import { AggregateRoot } from '@nestjs/cqrs'
import { entries, groupBy } from 'lodash'
import { randomBytes } from 'node:crypto'
import { ExcessInboundOrderException } from '../exceptions/excess-order.exception'
import { StockFlow } from '../types'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'

export class StockTransaction extends AggregateRoot {
	private readonly id: string = randomBytes(8).toString('hex')

	constructor(
		private readonly stockFlow: StockFlow,
		private readonly pendingInboundProductCodes: Array<ElectronicProductCode>,
		private readonly currentProgress: Array<{
			size_numcode: SizeNumber
			size_qty: number
			accumulated_qty: number
		}> = []
	) {
		super()
	}

	public get transactionId() {
		return this.id
	}

	public verify() {
		const incommingInboundSizeQuantities = entries(
			groupBy(this.pendingInboundProductCodes, (epc) => epc.getSize())
		).map(([size, epcs]) => ({
			size_numcode: new SizeNumber(size),
			inbound_qty: epcs.length
		}))

		const pendingInboundOrderProgress = this.currentProgress.map((inboundSizeDetail) => {
			const incomming = incommingInboundSizeQuantities.find((incoming) =>
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

		const excessedInboundSizes = pendingInboundOrderProgress.filter((size) => size.missing_qty < 0)

		const isInboundOrderExcessed = excessedInboundSizes.length > 0

		if (isInboundOrderExcessed) throw new ExcessInboundOrderException('', { cause: excessedInboundSizes })

		this.pendingInboundProductCodes
			.filter((epc) => !epc.getIsInternal() && epc.getIsWritable())
			.forEach((epc) => (epc.inboundTransactionId = this.id))

		return this.pendingInboundProductCodes
	}
}
