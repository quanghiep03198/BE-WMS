import { Query } from '@nestjs/cqrs'

export class GetProductionInventoryQuery extends Query<
	Array<{ mo_no: string; last_inbound_time: Date; order_qty: number; instock_qty: number }>
> {
	constructor(
		public readonly brandName: string,
		public readonly shoeStyle: string,
		public readonly color: string
	) {
		super()
	}
}
