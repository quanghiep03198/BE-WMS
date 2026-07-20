import { UpsertedEpcsMatchEvent } from '@modules/finished-goods/domain/events/upserted-epcs-match/upserted-epcs-match.event'
import { Injectable } from '@nestjs/common'
import { ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'

@Injectable()
export class EpcMatchSaga {
	@Saga()
	upsertedEpcsMatch(event$: Observable<unknown>): Observable<any> {
		return event$.pipe(
			ofType(UpsertedEpcsMatchEvent),
			map(({ data }) => {
				console.log(data)
				// TODO: Implement the logic to handle the upserted EPCs match event
			})
		)
	}
}
