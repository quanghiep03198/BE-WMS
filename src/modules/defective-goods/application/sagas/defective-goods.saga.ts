import { DefectiveGoodsChangedEvent } from '@modules/defective-goods/domain/events/defective-goods.events'
import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { bufferTime, filter, map, Observable } from 'rxjs'
import { SyncDefectiveGoodsCommand } from '../commands/sync-defective-goods/sync-defective-goods.command'

@Injectable()
export class DefectiveGoodsSaga {
	@Saga()
	defectiveGoodsCreated(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(DefectiveGoodsChangedEvent),
			bufferTime(1000, null, 500),
			filter((batch) => batch.length > 0),
			map(
				(batch: DefectiveGoodsChangedEvent[]) =>
					new SyncDefectiveGoodsCommand([...new Set(batch.map((e) => e.syncId))])
			)
		)
	}
}
