import { UpsertStockInDTO } from '@/modules/inoutbound/presentation/dto/rfid-inbound.dto'
import { Command } from '@nestjs/cqrs'

export class StockInCommand extends Command<void> {
	constructor(public readonly command: UpsertStockInDTO) {
		super()
	}
}
