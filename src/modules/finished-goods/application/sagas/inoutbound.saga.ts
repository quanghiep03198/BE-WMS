import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { map, Observable } from 'rxjs'
import { StockedInEvent } from '../../domain/events/stocked-in/stocked-in.event'
import { UpdateStockInTimestampFailedEvent } from '../../domain/events/update-stock-in-timestamp-failed/update-stock-in-date-failed.event'
import { UpdateStockInTimestampSuccessEvent } from '../../domain/events/update-stock-in-timestamp-success/update-stock-in-timestamp-success.event'
import { RollbackStockTransactionCommand } from '../commands/rollback-stock-tx/rollback-stock-tx.command'
import { SyncInventoryAuditCommand } from '../commands/sync-inventory-audit/sync-inventory-audit.command'
import { UpdateStockInTimestampCommand } from '../commands/update-stock-in-timestamp/update-stock-in-timestamp.command'

@Injectable()
export class InoutboundSaga {
	constructor(@InjectPinoLogger(InoutboundSaga.name) private readonly logger: PinoLogger) {}

	@Saga()
	insertedInboundDataToMssq(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(StockedInEvent),
			map(({ scannedEpcs }) => new UpdateStockInTimestampCommand(scannedEpcs))
		)
	}

	@Saga()
	updatedInboundTimestampSuccess(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(UpdateStockInTimestampSuccessEvent),
			map(() => new SyncInventoryAuditCommand({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }))
		)
	}

	@Saga()
	updateInboundTimestampFailed(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(UpdateStockInTimestampFailedEvent),
			map(({ stationNo, scannedEpcs }) => new RollbackStockTransactionCommand(stationNo, scannedEpcs))
		)
	}
}
