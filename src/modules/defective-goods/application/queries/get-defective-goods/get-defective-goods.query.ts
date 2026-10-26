export class GetDefectiveGoodsQuery {
	constructor(public readonly filter: Record<string, any>, public readonly page: number, public readonly limit: number) {}
}
