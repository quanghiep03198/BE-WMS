import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { Command } from '@nestjs/cqrs'

export class UpdateStockInTimestampCommand extends Command<void> {
	constructor(public readonly scannedEpcs: Array<ElectronicProductCode>) {
		super()
	}
}
