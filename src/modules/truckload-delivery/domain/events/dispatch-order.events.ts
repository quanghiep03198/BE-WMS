import { IEvent } from '@nestjs/cqrs'
import { DispatchOrderSignatureField } from '../constants'

export abstract class DispatchOrderEvent implements IEvent {
	constructor(public readonly dispatchOrder: string) {}
}

export class DispatchOrderCreatedEvent extends DispatchOrderEvent {}

export class DispatchOrderInfoUpdatedEvent extends DispatchOrderEvent {}

export class PurchaseOrdersUpsertedEvent extends DispatchOrderEvent {}

export class PurchaseOrderRemovedEvent extends DispatchOrderEvent {
	constructor(
		dispatchOrder: string,
		public readonly po: string
	) {
		super(dispatchOrder)
	}
}

export class DispatchOrderSignedEvent extends DispatchOrderEvent {
	constructor(
		dispatchOrder: string,
		public readonly signatureField: DispatchOrderSignatureField
	) {
		super(dispatchOrder)
	}
}

export class ContainerConditionUpdatedEvent extends DispatchOrderEvent {}

export class LicensePlateCapturedEvent extends DispatchOrderEvent {
	constructor(
		dispatchOrder: string,
		public readonly captureTime: Date
	) {
		super(dispatchOrder)
	}
}

export class DispatchOrderDeletedEvent extends DispatchOrderEvent {}
