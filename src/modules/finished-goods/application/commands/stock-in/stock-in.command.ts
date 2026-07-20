import { InventoryActions, InventoryStorageType } from '@modules/finished-goods/domain/constants'
import { Command } from '@nestjs/cqrs'

export class StockInCommand extends Command<void> {
	constructor(
		public readonly command: {
			mo_no: string
			inbound_device_sn: string
			rfid_status: InventoryActions
			rfid_use: InventoryStorageType
			dept_code: string
			dept_name: string
			storage: string
			quantity: number
			factory_code_produce: string
			username: string
			display_name: string
		}
	) {
		super()
	}
}
