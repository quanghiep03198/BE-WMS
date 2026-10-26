export class DeleteDefectiveGoodsCommand {
	constructor(public readonly ids: string[], public readonly filter: Record<string, any> = {}, public readonly username?: string) {}
}
