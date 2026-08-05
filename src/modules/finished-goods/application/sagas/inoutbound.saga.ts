import { RecalledFromStockEvent } from '@modules/finished-goods/domain/events/recalled-from-stock/recalled-from-stock.event'
import { StockedOutEvent } from '@modules/finished-goods/domain/events/stocked-out/stocked-out.event'
import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { map, Observable } from 'rxjs'
import { CommitStockInFailureEvent } from '../../domain/events/commit-stock-in-failure/commit-stock-in-failure.event'
import { StockedInEvent } from '../../domain/events/stocked-in/stocked-in.event'
import { CommitStockOutCommand } from '../commands/commit-stock-out/commit-stock-out.command'
import { CommitStockVariationCommand } from '../commands/commit-stock-variation/commit-stock-variation.command'
import { RollbackStockTransactionCommand } from '../commands/rollback-stock-tx/rollback-stock-tx.command'

@Injectable()
export class InoutboundSaga {
	constructor(@InjectPinoLogger(InoutboundSaga.name) private readonly logger: PinoLogger) {}

	/**
	 * TODO: add execution of CommitStockInCommand to BullMQ
	 * TODO: execute calculate manufacturing order inventory variantion and upsert to 2 collections in MongoDB, one for `mo_inventory_variation and one` for `daily_mo_inventory_variation`
	 */
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
			map(({ scannedEpcs }) => new CommitStockOutCommand(scannedEpcs)) // TODO: add execution of CommitStockInCommand to BullMQ
		)
	}

	@Saga()
	commitStockInFailure(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(CommitStockInFailureEvent),
			map(({ stationNo, scannedEpcs }) => new RollbackStockTransactionCommand(stationNo, scannedEpcs))
		)
	}
}
