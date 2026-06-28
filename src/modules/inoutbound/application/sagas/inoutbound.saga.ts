import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { map, Observable } from 'rxjs'
import { UpdateStockInDateFailedEvent } from '../../domain/events/update-stock-in-date-failed/update-stock-in-date-failed.event'
import { UpdateStockInDateSuccessEvent } from '../../domain/events/update-stock-in-date-success/update-stock-in-date-success.event'
import { RollbackStockTransactionCommand } from '../commands/rollback-stock-transaction/rollback-stock-transaction.command'
import { SyncInventoryAuditCommand } from '../commands/sync-inventory-audit/sync-inventory-audit.command'

@Injectable()
export class InoutboundSaga {
	constructor(@InjectPinoLogger(InoutboundSaga.name) private readonly logger: PinoLogger) {}

	@Saga()
	updateInboundTimestampSuccess(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(UpdateStockInDateSuccessEvent),
			map(() => new SyncInventoryAuditCommand({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }))
		)
	}

	@Saga()
	updateInboundTimestampFailed(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(UpdateStockInDateFailedEvent),
			map(({ stationNo, scannedEpcs }) => new RollbackStockTransactionCommand(stationNo, scannedEpcs))
		)
	}
}
