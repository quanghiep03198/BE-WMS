import { AggregateRoot } from '@nestjs/cqrs'
import { addMonths, format } from 'date-fns'
import { InventoryClosureStatus } from '../constants'
import { CheckedOutInventoryEvent } from '../events/checked-out-inventory/checked-out-inventory.event'
import { AlreadyCheckedOutException, CheckoutTimeNotElapsedException } from '../exceptions'

export class CheckOutInventoryAuditModel extends AggregateRoot {
	constructor(
		private readonly month: string,
		private readonly statuses: InventoryClosureStatus[]
	) {
		super()
	}

	startTransaction() {
		const nextMonth = format(addMonths(new Date(this.month), 1), 'yyyy-MM')
		const currentMonth = format(new Date(), 'yyyy-MM')

		if (nextMonth !== currentMonth) throw new CheckoutTimeNotElapsedException()

		if (this.statuses.every((stt) => stt === InventoryClosureStatus.COMPLETED)) throw new AlreadyCheckedOutException()

		this.apply(new CheckedOutInventoryEvent(this.month))
	}
}
