import { Command } from '@nestjs/cqrs'

export class StockOutCommand extends Command<void> {
	constructor(
		public readonly manufacturingOrders: string | Array<string>,
		public readonly purchaseOrder: string,
		public readonly sizes?: {
			size_numcode: string
			qty: number
		}[]
	) {
		super()
	}
}
