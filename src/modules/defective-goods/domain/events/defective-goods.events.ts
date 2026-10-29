import { IEvent } from '@nestjs/cqrs'

export class DefectiveGoodsCreatedEvent implements IEvent {
	constructor(
		public readonly createdDocs: string[],
		public readonly audit: { userCodeCreated?: string; userCodeUpdated?: string } = {}
	) {}
}

export class DefectiveGoodsDeletedEvent implements IEvent {
	constructor(
		public readonly id: string | string[],
		public readonly deletedBy: string
	) {}
}

export class DefectiveGoodsDeletedManyEvent implements IEvent {
	constructor(public readonly ids: string[]) {}
}

export class DefectiveGoodsStockedInEvent implements IEvent {
	constructor(
		public readonly ids: string[],
		public readonly audit: { userCodeCreated?: string; userCodeUpdated?: string } = {}
	) {}
}

export class DefectiveGoodsChangedEvent implements IEvent {
	constructor(
		public readonly documentIds: string[],
		public readonly audit: { createdBy?: string; updatedBy?: string } = {}
	) {}
}
