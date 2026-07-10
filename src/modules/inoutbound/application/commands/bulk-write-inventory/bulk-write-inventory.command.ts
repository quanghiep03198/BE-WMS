import { StockFlow } from '@modules/inoutbound/domain/types'
import { PostReaderDataDTO } from '@modules/inoutbound/presentation/dto/rfid-shared.dto'
import { Command } from '@nestjs/cqrs'

export class BulkWriteInventoryCommand extends Command<void> {
	constructor(public readonly command: { action: StockFlow; payload: PostReaderDataDTO }) {
		super()
	}
}
