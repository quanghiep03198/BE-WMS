import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'
import { DefectiveGoodsChangedEvent } from '../../domain/events/defective-goods.events'
import { SyncDefectiveGoodsCommand } from '../commands/sync-defective-goods/sync-defective-goods.command'

@Injectable()
export class DefectiveGoodsSaga {
	@Saga()
	syncToMssql(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(ofType(DefectiveGoodsChangedEvent), map(({ documentIds, audit }) => new SyncDefectiveGoodsCommand(documentIds, audit)))
	}
}
