import { StockedOutEvent } from '@modules/finished-goods/domain/events/stocked-out/stocked-out.event'
import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { map, Observable } from 'rxjs'
import { CommitStockInFailureEvent } from '../../domain/events/commit-stock-in-failure/commit-stock-in-failure.event'
import { CommitedStockIn } from '../../domain/events/committed-stock-in/commited-stock-in.event'
import { StockedInEvent } from '../../domain/events/stocked-in/stocked-in.event'
import { CommitStockInCommand } from '../commands/commit-stock-in/commit-stock-in.command'
import { CommitStockOutCommand } from '../commands/commit-stock-out/commit-stock-out.command'
import { RollbackStockTransactionCommand } from '../commands/rollback-stock-tx/rollback-stock-tx.command'
import { SyncInventoryAuditCommand } from '../commands/sync-inventory-audit/sync-inventory-audit.command'

@Injectable()
export class InoutboundSaga {
	constructor(@InjectPinoLogger(InoutboundSaga.name) private readonly logger: PinoLogger) {}

	/**
	 * TODO: add execution of CommitStockInCommand to BullMQ
	 * TODO: execute calculate manufacturing order inventory variantion and upsert to 2 collections in MongoDB, one for `mo_inventory_variation and one` for `daily_mo_inventory_variation`
	 */
	@Saga()
	insertedInboundDataToMongo(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(StockedInEvent),
			map(({ scannedEpcs }) => new CommitStockInCommand(scannedEpcs))
		)
	}

	@Saga()
	insertedOutboundDataToMssq(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(StockedOutEvent),
			map(({ scannedEpcs }) => new CommitStockOutCommand(scannedEpcs)) // TODO: add execution of CommitStockInCommand to BullMQ
		)
	}

	@Saga()
	committedStockIn(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(CommitedStockIn),
			map(() => new SyncInventoryAuditCommand({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }))
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
