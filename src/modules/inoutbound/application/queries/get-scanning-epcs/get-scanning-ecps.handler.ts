import { DATA_WAREHOUSE_CONNECTION } from '@/databases/constants'
import { InventoryEpcQueryBuilder } from '@/modules/inoutbound/infrastructure/persistence/mongodb/helpers/inventory-epc-query-builder'
import {
	InventoryEpc,
	InventoryEpcDocument,
	InventoryEpcModel
} from '@/modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery } from 'mongoose'
import { GetScanningEpcsQuery } from './get-scanning-epcs.query'

@QueryHandler(GetScanningEpcsQuery)
export class GetScanningEpcsHandler implements IQueryHandler<GetScanningEpcsQuery> {
	constructor(
		@InjectModel(InventoryEpc.name, DATA_WAREHOUSE_CONNECTION) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async execute({ flow, pagination, filterQuery }: GetScanningEpcsQuery) {
		const queryHint = (() => {
			let hint: string | undefined = undefined
			switch (true) {
				case flow === 'inbound': {
					hint = 'idx_inventory_epc_inbound_scan_page'
					break
				}
				case flow === 'outbound': {
					hint = 'idx_inventory_epc_outbound_scan_page'
					break
				}
				case !!filterQuery.mo_no: {
					hint = 'idx_inventory_epc_mo_scan_page'
					break
				}
			}
			return hint
		})()

		const query: FilterQuery<InventoryEpcDocument> = InventoryEpcQueryBuilder.createQueryBuilder()
			.withEqual('scannable', true)
			.withEqual('mo_no', filterQuery.mo_no)
			.withEqual('inbound_device_sn', filterQuery.inbound_device_sn)
			.withNull('inbound_at')
			.build()

		const paginateResult = await this.inventoryEpcModel.paginate(query, {
			sort: { last_scanned_at: -1, epc: 1, mo_no: 1 },
			lean: true,
			page: pagination.page,
			limit: pagination.limit,
			options: {
				readPreference: 'nearest',
				...(queryHint && { hint: queryHint })
			},
			customLabels: { docs: 'data' },
			projection: {
				_id: 0,
				epc: 1,
				mo_no: 1
			}
		})

		return {
			data: paginateResult.data as Record<'epc' | 'mo_no', string>[],
			page: paginateResult.page,
			limit: paginateResult.limit,
			hasNextPage: paginateResult.hasNextPage,
			hasPrevPage: paginateResult.hasPrevPage,
			nextPage: paginateResult.nextPage,
			prevPage: paginateResult.prevPage,
			totalDocs: paginateResult.totalDocs,
			totalPages: paginateResult.totalPages
		}
	}
}
