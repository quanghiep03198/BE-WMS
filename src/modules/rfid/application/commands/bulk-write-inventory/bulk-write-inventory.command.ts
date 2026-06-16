import { UploadAction } from '@/modules/rfid/domain/types'
import { PostReaderDataDTO } from '@/modules/rfid/presentation/dto/rfid-shared.dto'
import { ICommand } from '@nestjs/cqrs'

export class BulkWriteInventoryCommand implements ICommand {
	constructor(public readonly request: { action: UploadAction; payload: PostReaderDataDTO }) {}
}
