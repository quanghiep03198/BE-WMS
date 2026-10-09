import { RequestUser } from '@common/decorators'

export class CreateDispatchOrderCommand {
	constructor(
		/** Factory code of the request, e.g. `VA1`. */
		public readonly factoryCode: string,
		public readonly purchaseOrders: Array<{ po: string; outbound_qty: number }>,
		public readonly licensePlate?: string | null,
		public readonly containerNumber?: string | null,
		public readonly sealNumber?: string | null,
		public readonly createdBy?: RequestUser
	) {}
}
