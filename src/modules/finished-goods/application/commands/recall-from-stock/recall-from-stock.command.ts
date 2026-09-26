import { StockAction, StockTransactionPurpose } from '@modules/finished-goods/domain/constants'
import { Command } from '@nestjs/cqrs'

export class RecallFromStockCommand extends Command<void> {
	constructor(
		public readonly command: {
			mo_no: string
			inbound_device_sn: string
			action: StockAction
			purpose: StockTransactionPurpose
			quantity: number
			factory_code_produce: string
			username: string
			display_name: string
		}
	) {
		super()
	}
}
