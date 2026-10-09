import { RequestUser } from '@common/decorators'

export class UpsertPurchaseOrdersCommand {
	constructor(
		public readonly dispatchOrder: string,
		public readonly purchaseOrders: Array<{ po: string; outbound_qty: number }>,
		public readonly updatedBy?: RequestUser
	) {}
}
