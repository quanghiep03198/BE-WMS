import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'
import { ExchangeMoSuccessEvent } from '../../domain/events/exchange-mo-success/exchange-mo-success.event'
import { ExchangeMoMongoCommand } from '../commands/exchange-manufacturing-order/exchange-mo-mongo.command'

@Injectable()
export class ExchangeMoSessionSaga {
	@Saga()
	exchangeMoInMssqlSuccessfully(event$: Observable<unknown>): Observable<ICommand> {
		return event$.pipe(
			ofType(ExchangeMoSuccessEvent),
			map(() => new ExchangeMoMongoCommand())
		)
	}
}
