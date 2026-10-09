import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, Observable } from 'rxjs'
import {
	ContainerConditionUpdatedEvent,
	DispatchOrderCreatedEvent,
	DispatchOrderDeletedEvent,
	DispatchOrderInfoUpdatedEvent,
	DispatchOrderSignedEvent,
	LicensePlateCapturedEvent,
	PurchaseOrderRemovedEvent,
	PurchaseOrdersUpsertedEvent
} from '../../domain/events/dispatch-order.events'
import { ResolveLicensePlateCaptureCommand } from '../commands/resolve-license-plate-capture/resolve-license-plate-capture.command'
import { SyncDispatchOrderToMssqlCommand } from '../commands/sync-dispatch-order-to-mssql/sync-dispatch-order-to-mssql.command'

@Injectable()
export class TruckloadDeliverySaga {
	/** Every change of the MongoDB document is mirrored to MSSQL. */
	@Saga()
	syncToMssql(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(
				DispatchOrderCreatedEvent,
				DispatchOrderInfoUpdatedEvent,
				PurchaseOrdersUpsertedEvent,
				PurchaseOrderRemovedEvent,
				DispatchOrderSignedEvent,
				ContainerConditionUpdatedEvent,
				LicensePlateCapturedEvent,
				DispatchOrderDeletedEvent
			),
			map(({ dispatchOrder }) => new SyncDispatchOrderToMssqlCommand(dispatchOrder))
		)
	}

	/** License plate / sealing / departure time changed, so the camera capture window may have changed. */
	@Saga()
	resolveLicensePlateCapture(events$: Observable<unknown>): Observable<ICommand> {
		return events$.pipe(
			ofType(DispatchOrderInfoUpdatedEvent, DispatchOrderSignedEvent),
			map(({ dispatchOrder }) => new ResolveLicensePlateCaptureCommand(dispatchOrder))
		)
	}
}
