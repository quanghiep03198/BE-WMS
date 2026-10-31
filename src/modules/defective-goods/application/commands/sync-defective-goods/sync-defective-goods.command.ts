import { Command } from '@nestjs/cqrs'

export class SyncDefectiveGoodsCommand extends Command<void> {
	constructor(
		public readonly syncIds: string[],
		public readonly audit: { createdBy?: string; updatedBy?: string } = {}
	) {
		super()
	}
}
