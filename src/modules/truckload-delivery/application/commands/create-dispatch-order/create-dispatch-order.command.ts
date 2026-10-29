import { TRequestUser } from '@common/decorators'

export class CreateDispatchOrderCommand {
	constructor(
		/** Factory code of the request, e.g. `VA1`. */
		public readonly factoryCode: string,
		public readonly purchaseOrders: Array<{ po: string; outbound_qty: number }>,
		public readonly createdBy: TRequestUser,
		public readonly licensePlate?: Nullish<string>,
		public readonly containerNumber?: Nullish<string>,
		public readonly sealNumber?: Nullish<string>
	) {}
}
