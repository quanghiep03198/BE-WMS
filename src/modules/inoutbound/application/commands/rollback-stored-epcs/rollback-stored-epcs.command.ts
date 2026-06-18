import { ElectronicProductCode } from '@/modules/inoutbound/domain/entities/epc.entity'
import { Command } from '@nestjs/cqrs'

export class RollbackStoredEpcsCommand extends Command<any> {
	constructor(public readonly scannedEpcs: Array<ElectronicProductCode>) {
		super()
	}
}
