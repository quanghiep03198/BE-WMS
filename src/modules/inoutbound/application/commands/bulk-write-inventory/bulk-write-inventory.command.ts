import { UploadAction } from '@/modules/inoutbound/domain/types'
import { PostReaderDataDTO } from '@/modules/inoutbound/presentation/dto/rfid-shared.dto'
import { ICommand } from '@nestjs/cqrs'

export class BulkWriteInventoryCommand implements ICommand {
	constructor(public readonly request: { action: UploadAction; payload: PostReaderDataDTO }) {}
}
