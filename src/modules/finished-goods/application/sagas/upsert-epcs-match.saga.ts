import { UpsertedEpcsMatchEvent } from '@modules/finished-goods/domain/events/upserted-epcs-match/upserted-epcs-match.event'
import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'
import { UpdateScanningEpcsMatchCommand } from '../commands/update-scanning-epcs-match/update-scanning-epcs-match.command'

@Injectable()
export class EpcMatchSaga {
	@Saga()
	upsertedEpcsMatch(event$: Observable<unknown>): Observable<ICommand> {
		return event$.pipe(
			ofType(UpsertedEpcsMatchEvent),
			map(({ data }) => new UpdateScanningEpcsMatchCommand(data))
		)
	}
}
