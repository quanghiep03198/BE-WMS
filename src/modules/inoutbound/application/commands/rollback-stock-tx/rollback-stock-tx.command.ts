import { ElectronicProductCode } from '@/modules/inoutbound/domain/value-objects/epc.vo'
import { Command } from '@nestjs/cqrs'

export class RollbackStockTransactionCommand extends Command<any> {
	constructor(
		public readonly stationNo: 'WH101' | 'WH103',
		public readonly movedSkus: Array<ElectronicProductCode>
	) {
		super()
	}
}
