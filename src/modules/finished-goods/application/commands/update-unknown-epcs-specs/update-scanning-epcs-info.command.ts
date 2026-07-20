import { UpsertEpcsMatchPayload } from '@modules/finished-goods/domain/types'
import { Command } from '@nestjs/cqrs'

export class UpdateScanningEpcsInfoCommand extends Command<void> {
	constructor(public readonly data: UpsertEpcsMatchPayload) {
		super()
	}
}
