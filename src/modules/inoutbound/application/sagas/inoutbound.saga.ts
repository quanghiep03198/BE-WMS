import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'
import { StockedInEvent } from '../../domain/events/stocked-in/stocked-in.event'
import { UpdateStockInDateCommand } from '../commands/update-stock-in-date/update-stock-in-date.command'

@Injectable()
export class InoutboundSagas {
	@Saga()
	upsertedInMSSQL = (events$: Observable<any>): Observable<ICommand> => {
		return events$.pipe(
			ofType(StockedInEvent),
			map((event) => new UpdateStockInDateCommand(event.scannedEpcs))
		)
	}
}
