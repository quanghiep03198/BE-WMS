import { AggregateRoot } from '@nestjs/cqrs'
import { entries, groupBy } from 'lodash'
import { RecalledFromStockEvent } from '../events/recalled-from-stock/recalled-from-stock.event'
import { InsufficientInventoryException } from '../exceptions/insufficient-inventory.exception'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'
import { isValidMoSizeProgress, type MoSizeProgress } from './mo-size-progress'

export class RecallFromStockTransaction extends AggregateRoot {
	constructor(
		public readonly pendingRecallEpcs: Array<ElectronicProductCode>,
		public readonly moInventory: MoSizeProgress[] = [],
		private readonly id: string
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

		const invalidSizes = transactionalSizeQty.flatMap(({ size_numcode, recall_qty }) => {
			const progress = this.moInventory.find((item) => item.size_numcode.isEqual(size_numcode))
			if (isValidMoSizeProgress(progress, -recall_qty)) return []

			return [{ size_numcode: size_numcode.getValue(), instock_qty: (progress?.instock_qty ?? 0) - recall_qty }]
		})

		if (invalidSizes.length)
			throw new InsufficientInventoryException('MO size inventory or order limit violated for recall', {
				cause: invalidSizes
			})

		this.apply(new RecalledFromStockEvent(this.pendingRecallEpcs))

		return this.id
	}
}
