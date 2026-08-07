import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'
import { ExchangeMoSuccessEvent } from '../../domain/events/exchange-mo-success/exchange-mo-success.event'
import { ExchangeMoWmCommand } from '../commands/exchange-mo/impl/exchange-mo-wm.command'

@Injectable()
export class ExchangeMoSaga {
	@Saga()
	exchangeMoRmSuccessfully(event$: Observable<unknown>): Observable<ICommand> {
		return event$.pipe(
			ofType(ExchangeMoSuccessEvent),
			map(({ exchangeSkus, targetMo }) => new ExchangeMoWmCommand(exchangeSkus, targetMo))
		)
	}
}
