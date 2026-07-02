import { ElectronicProductCode } from '@/modules/inoutbound/domain/value-objects/epc.vo'
import { Command } from '@nestjs/cqrs'

export class UpdateStockInDateCommand extends Command<void> {
	constructor(public readonly scannedEpcs: Array<ElectronicProductCode>) {
		super()
	}
}
