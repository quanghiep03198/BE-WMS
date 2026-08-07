import { UpsertedEpcsMatchEvent } from '@modules/finished-goods/domain/events/upserted-epcs-match/upserted-epcs-match.event'
import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'
import { CommitUpsertEpcsMatchCommand } from '../commands/commit-upsert-epcs-match/commit-upsert-epcs-match.command'

@Injectable()
export class UpsertEpcsMatchSaga {
	@Saga()
	upsertedEpcsMatch(event$: Observable<unknown>): Observable<ICommand> {
		return event$.pipe(
			ofType(UpsertedEpcsMatchEvent),
			map(({ data }) => new CommitUpsertEpcsMatchCommand(data))
		)
	}
}
