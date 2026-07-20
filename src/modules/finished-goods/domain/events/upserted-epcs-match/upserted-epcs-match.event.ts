import { IEvent } from '@nestjs/cqrs'
import { UpsertEpcsMatchPayload } from '../../types'

export class UpsertedEpcsMatchEvent implements IEvent {
	constructor(public readonly data: UpsertEpcsMatchPayload) {}
}
