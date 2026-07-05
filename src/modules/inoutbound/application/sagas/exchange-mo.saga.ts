import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'
import { ExchangeMoFailedEvent } from '../../domain/events/exchange-mo-failed/exchange-mo-failed.event'
import { ExchangeMoSuccessEvent } from '../../domain/events/exchange-mo-success/exchange-mo-success.event'
import { ExchangeMoWmCommand } from '../commands/exchange-mo/impl/exchange-mo-wm.command'
import { RollbackExchangeMoTransactionCommand } from '../commands/rollback-exchange-mo-tx/rollback-exchange-mo-tx.command'

@Injectable()
export class ExchangeMoSaga {
	@Saga()
	exchangeMoInMssqlSuccessfully(event$: Observable<unknown>): Observable<ICommand> {
		return event$.pipe(
			ofType(ExchangeMoSuccessEvent),
			map(({ exchangeSkus, targetMo }) => new ExchangeMoWmCommand(exchangeSkus, targetMo))
		)
	}

	@Saga()
	exchangeMoInMongoFailed(event$: Observable<unknown>): Observable<ICommand> {
		return event$.pipe(
			ofType(ExchangeMoFailedEvent),
			map(({ exchangeSkus }) => new RollbackExchangeMoTransactionCommand(exchangeSkus))
		)
	}
}
