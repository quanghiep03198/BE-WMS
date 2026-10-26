import { DefectiveGoodsWriteData } from '../../ports/defective-goods.repository.port'

export class UpsertDefectiveGoodsCommand {
	constructor(public readonly items: DefectiveGoodsWriteData[], public readonly username: string) {}
}
