import { IEvent } from '@nestjs/cqrs'

export class DefectiveGoodsCreatedEvent implements IEvent {
	constructor(
		public readonly id: TObjectId,
		public readonly audit: { userCodeCreated?: string; userCodeUpdated?: string } = {}
	) {}
}

export class DefectiveGoodsDeletedEvent implements IEvent {
	constructor(
		public readonly id: string | Array<string>,
		public readonly deletedBy: string
	) {}
}

export class DefectiveGoodsDeletedManyEvent implements IEvent {
	constructor(public readonly ids: Array<string>) {}
}

export class DefectiveGoodsStockedInEvent implements IEvent {
	constructor(
		public readonly ids: Array<string>,
		public readonly audit: { userCodeCreated?: string; userCodeUpdated?: string } = {}
	) {}
}

export class DefectiveGoodsChangedEvent implements IEvent {
	constructor(
		public readonly syncId: string,
		public readonly audit: { createdBy?: string; updatedBy?: string; deletedBy?: string } = {}
	) {}
}
