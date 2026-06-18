import { ElectronicProductCode } from '@/modules/inoutbound/domain/entities/epc.entity'
import { Command } from '@nestjs/cqrs'

export class UpdateStockInDateCommand extends Command<number> {
	constructor(public readonly command: { scannedEpcs: Array<ElectronicProductCode> }) {
		super()
	}
}
