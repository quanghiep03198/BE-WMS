import { Command } from '@nestjs/cqrs'

export class StockOutCommand extends Command<void> {
	constructor(
		public readonly purchaseOrder: string,
		public readonly manufacturingOrders: string | Array<string>,
		public readonly sizes?: Array<{
			size_numcode: string
			qty: number
		}>
	) {
		super()
	}
}
