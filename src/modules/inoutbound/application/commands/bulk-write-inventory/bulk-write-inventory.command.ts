import { StockMovementDirection } from '@/modules/inoutbound/domain/types'
import { PostReaderDataDTO } from '@/modules/inoutbound/presentation/dto/rfid-shared.dto'
import { Command } from '@nestjs/cqrs'

export class BulkWriteInventoryCommand extends Command<void> {
	constructor(public readonly command: { action: StockMovementDirection; payload: PostReaderDataDTO }) {
		super()
	}
}
