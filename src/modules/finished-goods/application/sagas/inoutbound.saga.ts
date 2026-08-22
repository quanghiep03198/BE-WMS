import { RecalledFromStockEvent } from '@modules/finished-goods/domain/events/recalled-from-stock/recalled-from-stock.event'
import { RolledBackInboundTxEvent } from '@modules/finished-goods/domain/events/rolledback-inbound-tx/rolledback-inbound-tx.event'
import { StockedOutEvent } from '@modules/finished-goods/domain/events/stocked-out/stocked-out.event'
import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'
import { StockedInEvent } from '../../domain/events/stocked-in/stocked-in.event'
import { CommitRollbackInboundTxCommand } from '../commands/commit-rollback-inbound-tx/commit-rollback-inbound-tx.command'
import { CommitStockBalancesCommand } from '../commands/commit-stock-balances/commit-stock-balances.command'
import { CommitStockOutCommand } from '../commands/commit-stock-out/commit-stock-out.command'

@Injectable()
export class InoutboundSaga {
	@Saga()
	stockedIn(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(StockedInEvent),
			map(({ stockedInEpcs }) => new CommitStockBalancesCommand(stockedInEpcs, 'inbound'))
		)
	}

	@Saga()
	recalledFromStock(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(RecalledFromStockEvent),
			map(({ recalledEpcs }) => new CommitStockBalancesCommand(recalledEpcs, 'outbound'))
		)
	}

	@Saga()
	stockedOut(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(StockedOutEvent),
			map(({ scannedEpcs }) => new CommitStockOutCommand(scannedEpcs))
		)
	}

	@Saga()
	rollbackInboundTx(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(RolledBackInboundTxEvent),
			map(({ rolledBackEpcs }) => new CommitRollbackInboundTxCommand(rolledBackEpcs))
		)
	}
}
