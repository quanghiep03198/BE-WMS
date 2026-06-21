import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { map, Observable } from 'rxjs'
import { UpdateStockInDateFailedEvent } from '../../domain/events/update-stock-in-date-failed/update-stock-in-date-failed.event'
import { UpdateStockInDateSuccessEvent } from '../../domain/events/update-stock-in-date-success/update-stock-in-date-success.event'
import { RollbackStoredEpcsCommand } from '../commands/rollback-stored-epcs/rollback-stored-epcs.command'
import { SyncInventoryAuditCommand } from '../commands/sync-inventory-audit/sync-inventory-audit.command'
// import { StockedInEvent } from '../../domain/events/stocked-in/stocked-in.event'
// import { UpdateStockInDateCommand } from '../commands/update-stock-in-date/update-stock-in-date.command'

@Injectable()
export class InoutboundSaga {
	constructor(@InjectPinoLogger(InoutboundSaga.name) private readonly logger: PinoLogger) {}

	@Saga()
	updateInboundTimestampSuccess = (events$: Observable<any>): Observable<ICommand> => {
		return events$.pipe(
			ofType(UpdateStockInDateSuccessEvent),
			map(() => new SyncInventoryAuditCommand({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }))
		)
	}

	@Saga()
	updateInboundTimestampFailed = (events$: Observable<any>): Observable<ICommand> => {
		this.logger.debug('InoutboundSaga upsertedInMSSQL received events')
		return events$.pipe(
			ofType(UpdateStockInDateFailedEvent),
			map(({ stationNo, scannedEpcs }) => new RollbackStoredEpcsCommand(stationNo, scannedEpcs))
		)
	}
}
