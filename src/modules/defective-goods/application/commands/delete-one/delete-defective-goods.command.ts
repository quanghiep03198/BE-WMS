export class DeleteOneDefectiveGoodsCommand {
	constructor(
		public readonly id: string,
		public readonly username?: string
	) {}
}
