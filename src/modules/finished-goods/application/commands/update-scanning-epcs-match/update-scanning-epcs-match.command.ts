import { UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { Command } from '@nestjs/cqrs'

export class UpdateScanningEpcsMatchCommand extends Command<void> {
	constructor(public readonly data: UpsertEpcsMatchData) {
		super()
	}
}
