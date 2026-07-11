import { StockFlow } from '@modules/finished-goods/domain/types'
import { PostReaderDataDTO } from '@modules/finished-goods/presentation/dto/rfid-shared.dto'
import { Command } from '@nestjs/cqrs'

export class BulkWriteInventoryCommand extends Command<void> {
	constructor(public readonly command: { action: StockFlow; payload: PostReaderDataDTO }) {
		super()
	}
}
