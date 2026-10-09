import { RequestUser } from '@common/decorators'
import { DispatchOrderInfoUpdate } from '../../../domain/models/dispatch-order.model'

export class UpdateDispatchOrderCommand {
	constructor(
		public readonly dispatchOrder: string,
		public readonly update: DispatchOrderInfoUpdate,
		public readonly updatedBy?: RequestUser
	) {}
}
