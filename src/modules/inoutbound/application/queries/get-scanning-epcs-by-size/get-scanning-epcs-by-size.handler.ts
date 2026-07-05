import {
	InventoryEpc,
	InventoryEpcDocument,
	InventoryEpcModel
} from '@/modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery } from 'mongoose'
import { GetScanningEpcsBySizeQuery } from './get-scanning-epcs-by-size.query'

@QueryHandler(GetScanningEpcsBySizeQuery)
export class GetScanningEpcsBySizeHandler implements IQueryHandler<GetScanningEpcsBySizeQuery> {
	constructor(@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel) {}

	public async execute(query: GetScanningEpcsBySizeQuery) {
		const filterQuery: FilterQuery<InventoryEpcDocument> = {
			scannable: true,
			mo_no: query.manufacturingOrder,
			size_numcode: query.sizeNumber
		}

		if (query.stockMovementDirection === 'inbound' && query.inboundDeviceSerialNumber) {
			filterQuery.inbound_device_sn = { $eq: query.inboundDeviceSerialNumber }
			filterQuery.inbound_at = { $eq: null }
		}

		if (query.stockMovementDirection === 'outbound') {
			filterQuery.outbound_at = { $eq: null }
			filterQuery.po = { $eq: null }
		}

		return await this.inventoryEpcModel.find(filterQuery, { _id: 0, epc: 1 }).lean()
	}
}
