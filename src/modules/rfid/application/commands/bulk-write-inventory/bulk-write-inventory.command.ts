import { PostReaderDataDTO } from '@/modules/rfid/infrastructure/dto/rfid-shared.dto'
import { ICommand } from '@nestjs/cqrs'

export class BulkWriteInventoryCommand implements ICommand {
	constructor(public readonly request: { action: 'inbound' | 'outbound'; payload: PostReaderDataDTO }) {}
}
