import { UpdatedInventorySupplementalQtyEvent } from '@modules/inventory/domain/events/updated-inventory-supplemental-qty/updated-inventory-supplemental-qty.event'
import { Injectable } from '@nestjs/common'
import { ICommand, ofType, Saga } from '@nestjs/cqrs'
import { map, type Observable } from 'rxjs'
import { ReconcileInventorySupplementalQtyCommand } from '../commands/reconcile-inventory-supplemental-qty/reconcile-inventory-supplemental-qty.command'

@Injectable()
export class InventoryAuditSaga {
	@Saga()
	reconcileInventorySupplementalQty(event$: Observable<unknown>): Observable<ICommand> {
		return event$.pipe(
			ofType(UpdatedInventorySupplementalQtyEvent),
			map(({ yearMonth, manufacturingOrder, update, updatedBy }) => {
				return new ReconcileInventorySupplementalQtyCommand(yearMonth, manufacturingOrder, update, updatedBy)
			})
		)
	}
}
