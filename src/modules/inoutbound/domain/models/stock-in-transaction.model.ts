import { AggregateRoot } from '@nestjs/cqrs'
import { groupBy } from 'lodash'
import { randomBytes } from 'node:crypto'
import { ExcessInboundOrderException } from '../exceptions/excess-inbound-order.exception'
import { ElectronicProductCode } from '../value-objects/epc.vo'

export class StockInTransaction extends AggregateRoot {
	private readonly id: string = randomBytes(8).toString('hex')

	constructor(
		private readonly pendingInboundProductCodes: Array<ElectronicProductCode> = [],
		private readonly currentInboundProgress: Array<{
			size_numcode: string
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
		const incommingInboundSizeQuantities = Object.entries(groupBy(scannedEpcs, (epc) => epc.getSize())).map(
			([size, epcs]) => ({
				size_numcode: size,
				inbound_qty: epcs.length
			})
		)
		const isInboundOrderExcessed = this.currentInboundProgress
			.map((inboundSizeDetail) => {
				const incomming = incommingInboundSizeQuantities.find(
					(incoming) => incoming.size_numcode === inboundSizeDetail.size_numcode
				)
				return {
					size_numcode: inboundSizeDetail.size_numcode,
					missing_qty:
						inboundSizeDetail.size_qty - inboundSizeDetail.accumulated_inbound_qty - (incomming?.inbound_qty ?? 0)
				}
			})
			.some((size) => size.missing_qty < 0)

		if (isInboundOrderExcessed) throw new ExcessInboundOrderException('', { cause: isInboundOrderExcessed })

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
