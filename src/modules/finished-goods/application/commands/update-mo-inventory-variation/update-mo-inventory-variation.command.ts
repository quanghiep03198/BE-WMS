import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { Command } from '@nestjs/cqrs'

export class UpdateMoInventoryVariationCommand extends Command<void> {
	constructor(public readonly updatedStockEpcs: Array<ElectronicProductCode>) {
		super()
	}
}
