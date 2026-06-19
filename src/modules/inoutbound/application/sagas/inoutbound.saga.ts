import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { map, Observable } from 'rxjs'
import { StockedInEvent } from '../../domain/events/stocked-in/stocked-in.event'
import { UpdateStockInDateCommand } from '../commands/update-stock-in-date/update-stock-in-date.command'

@Injectable()
export class InoutboundSaga {
	constructor(@InjectPinoLogger(InoutboundSaga.name) private readonly logger: PinoLogger) {}

	@Saga()
	upsertedInMSSQL = (events$: Observable<any>): Observable<ICommand> => {
		this.logger.debug('InoutboundSaga upsertedInMSSQL received events')
		return events$.pipe(
			ofType(StockedInEvent),
			map(({ scannedEpcs }) => new UpdateStockInDateCommand(scannedEpcs))
		)
	}
}
