import { AggregateRoot } from '@nestjs/cqrs'
import { entries, groupBy } from 'lodash'
import { randomBytes } from 'node:crypto'
import { ExcessInboundOrderException } from '../exceptions/excess-inbound-order.exception'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'

export class StockInTransaction extends AggregateRoot {
	private readonly id: string = randomBytes(8).toString('hex')

	constructor(
		private readonly pendingInboundProductCodes: Array<ElectronicProductCode> = [],
		private readonly currentInboundProgress: Array<{
			size_numcode: SizeNumber
			size_qty: number
			accumulated_inbound_qty: number
		}> = []
	) {
		super()
	}

	public get transactionId() {
		return this.id
	}

	public verify(scannedEpcs: Array<ElectronicProductCode>) {
		const incommingInboundSizeQuantities = entries(groupBy(scannedEpcs, (epc) => epc.getSize())).map(
			([size, epcs]) => ({
				size_numcode: new SizeNumber(size),
				inbound_qty: epcs.length
			})
		)

		const pendingInboundOrderProgress = this.currentInboundProgress.map((inboundSizeDetail) => {
			const incomming = incommingInboundSizeQuantities.find((incoming) =>
				inboundSizeDetail.size_numcode.isEqual(incoming.size_numcode)
			)
			if (!incomming)
				return {
					size_numcode: inboundSizeDetail.size_numcode.getValue(),
					missing_qty: inboundSizeDetail.size_qty - inboundSizeDetail.accumulated_inbound_qty
				}
			return {
				size_numcode: inboundSizeDetail.size_numcode.getValue(),
				missing_qty: inboundSizeDetail.size_qty - inboundSizeDetail.accumulated_inbound_qty - incomming.inbound_qty
			}
		})

		const excessedInboundSizes = pendingInboundOrderProgress.filter((size) => size.missing_qty < 0)

		const isInboundOrderExcessed = excessedInboundSizes.length > 0

		if (isInboundOrderExcessed) throw new ExcessInboundOrderException('', { cause: excessedInboundSizes })

		this.pendingInboundProductCodes.push(
			...scannedEpcs
				.filter((epc) => !epc.getIsInternal() && epc.getIsWritable())
				.map((epc) => {
					epc.inboundTransactionId = this.id
					return epc
				})
		)

		return this.pendingInboundProductCodes
	}
}
