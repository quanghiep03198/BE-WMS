import { DefectiveGoodsInventoryService } from '../../services/defective-inventory.service'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ExportDefectiveGoodsInventoryQuery } from './export-defective-goods-inventory.query'

@QueryHandler(ExportDefectiveGoodsInventoryQuery)
export class ExportDefectiveGoodsInventoryHandler implements IQueryHandler<ExportDefectiveGoodsInventoryQuery, Buffer> {
	constructor(private readonly service: DefectiveGoodsInventoryService) {}
	async execute({ factoryCode }: ExportDefectiveGoodsInventoryQuery) {
		return this.service.exportDefectiveGoodsInventory(factoryCode)
	}
}
