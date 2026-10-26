import { IEvent } from '@nestjs/cqrs'

export class DefectiveGoodsChangedEvent implements IEvent {
	constructor(
		public readonly documentIds: string[],
		public readonly audit: { userCodeCreated?: string; userCodeUpdated?: string } = {}
	) {}
}
