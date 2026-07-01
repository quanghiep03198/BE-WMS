import { InventoryAction } from '@/modules/inoutbound/domain/types'
import { Command } from '@nestjs/cqrs'

export class DeleteScanningEpcsCommand extends Command<void> {
	constructor(
		public readonly inventoryAction: InventoryAction,
		public readonly scanningEpcs: Array<string>,
		public readonly rescannable: boolean
	) {
		super()
	}
}
