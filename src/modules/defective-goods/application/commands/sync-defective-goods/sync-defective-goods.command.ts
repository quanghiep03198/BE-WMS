export class SyncDefectiveGoodsCommand {
	constructor(
		public readonly documentIds: string[],
		public readonly audit: { userCodeCreated?: string; userCodeUpdated?: string } = {}
	) {}
}
