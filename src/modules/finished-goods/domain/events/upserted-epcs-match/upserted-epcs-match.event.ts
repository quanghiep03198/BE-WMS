import { IEvent } from '@nestjs/cqrs'
import { UpsertEpcsMatchData } from '../../types'

export class UpsertedEpcsMatchEvent implements IEvent {
	constructor(public readonly data: UpsertEpcsMatchData) {}
}
