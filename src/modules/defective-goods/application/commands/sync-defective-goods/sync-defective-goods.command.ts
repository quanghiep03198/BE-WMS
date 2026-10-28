import { Command } from '@nestjs/cqrs'

export class SyncDefectiveGoodsCommand extends Command<void> {
	constructor(
		public readonly documentIds: string[],
		public readonly audit: { userCodeCreated?: string; userCodeUpdated?: string } = {}
	) {
		super()
	}
}
