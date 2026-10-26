import { DefectiveGoodsWriteData } from '../../ports/defective-goods.repository.port'

export class UpdateDefectiveGoodsCommand {
	constructor(public readonly id: string, public readonly data: DefectiveGoodsWriteData, public readonly username: string) {}
}
