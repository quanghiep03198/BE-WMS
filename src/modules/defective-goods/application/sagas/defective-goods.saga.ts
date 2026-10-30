import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { bufferTime, filter, map, Observable } from 'rxjs'
import { DefectiveGoodsChangedEvent } from '../../domain/events/defective-goods.events'
import { SyncDefectiveGoodsCommand } from '../commands/sync-defective-goods/sync-defective-goods.command'

@Injectable()
export class DefectiveGoodsSaga {
	@Saga()
	syncToMssql(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(DefectiveGoodsChangedEvent),
			bufferTime(5000, null, 1000),
			filter((events) => events.length > 0),
			map(
				(batch) =>
					new SyncDefectiveGoodsCommand(
						batch.map((event) => event.documentId),
						batch[0].audit
					)
			)
		)
	}
}
