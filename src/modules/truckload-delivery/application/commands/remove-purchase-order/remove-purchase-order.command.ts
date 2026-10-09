import { RequestUser } from '@common/decorators'

export class RemovePurchaseOrderCommand {
	constructor(
		public readonly dispatchOrder: string,
		public readonly po: string,
		public readonly removedBy?: RequestUser
	) {}
}
