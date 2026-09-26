import { StockAction, StockTransactionPurpose } from '@modules/finished-goods/domain/constants'
import { Command } from '@nestjs/cqrs'

export class StockInCommand extends Command<void> {
	constructor(
		public readonly command: {
			mo_no: string
			inbound_device_sn: string
			action: StockAction
			purpose: StockTransactionPurpose
			assembly_line: {
				name: string
				code: string
			}
			warehouse: string
			storage_location: string
			quantity: number
			factory_code_produce: string
			username: string
			display_name: string
		}
	) {
		super()
	}
}
