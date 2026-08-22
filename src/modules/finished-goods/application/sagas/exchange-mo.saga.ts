import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'
import { ExchangedManufacturingOrderEvent } from '../../domain/events/exchanged-manufacturing-order/exchanged-manufacturing-order.event'
import { ExchangeMoWmCommand } from '../commands/exchange-mo/impl/exchange-mo-wm.command'

@Injectable()
export class ExchangeMoSaga {
	@Saga()
	exchangeMoRmSuccessfully(event$: Observable<unknown>): Observable<ICommand> {
		return event$.pipe(
			ofType(ExchangedManufacturingOrderEvent),
			map(({ exchangeSkus, targetMo }) => new ExchangeMoWmCommand(exchangeSkus, targetMo))
		)
	}
}
