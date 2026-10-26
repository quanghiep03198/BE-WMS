import { DefectiveGoodsInventoryService } from '../../services/defective-inventory.service'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetDefectiveGoodsInventoryQuery } from './get-defective-goods-inventory.query'

@QueryHandler(GetDefectiveGoodsInventoryQuery)
export class GetDefectiveGoodsInventoryHandler implements IQueryHandler<GetDefectiveGoodsInventoryQuery> {
	constructor(private readonly service: DefectiveGoodsInventoryService) {}
	async execute() {
		return this.service.getDefectiveGoodsInventory()
	}
}
