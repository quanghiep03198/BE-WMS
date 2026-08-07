import { RecalledFromStockEvent } from '@modules/finished-goods/domain/events/recalled-from-stock/recalled-from-stock.event'
import { StockedOutEvent } from '@modules/finished-goods/domain/events/stocked-out/stocked-out.event'
import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'
import { StockedInEvent } from '../../domain/events/stocked-in/stocked-in.event'
import { CommitStockOutCommand } from '../commands/commit-stock-out/commit-stock-out.command'
import { CommitStockVariationCommand } from '../commands/commit-stock-variation/commit-stock-variation.command'

@Injectable()
export class InoutboundSaga {
	@Saga()
	stockedIn(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(StockedInEvent),
			map(({ stockedInEpcs }) => new CommitStockVariationCommand(stockedInEpcs, 'inbound'))
		)
	}

	@Saga()
	recalledFromStock(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(RecalledFromStockEvent),
			map(({ recalledEpcs }) => new CommitStockVariationCommand(recalledEpcs, 'outbound'))
		)
	}

	@Saga()
	stockedOut(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(StockedOutEvent),
			map(({ scannedEpcs }) => new CommitStockOutCommand(scannedEpcs))
		)
	}
}
