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
	constructor(@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel) {}

	public async execute({ params }: GetScanningEpcsQuery) {
		const manufacturingOrder = params['mo_no.eq']
		const inboundDeviceSerialNumber = params['inbound_device_sn.eq']
		const outboundDeviceSerialNumber = params['outbound_device_sn.eq']

		const paginationHint = inboundDeviceSerialNumber
			? 'idx_inventory_epc_inbound_scan_page'
			: outboundDeviceSerialNumber
				? 'idx_inventory_epc_outbound_scan_page'
				: manufacturingOrder
					? 'idx_inventory_epc_mo_scan_page'
					: undefined

		const filterQuery: FilterQuery<InventoryEpcDocument> = {
			scannable: true,
			deleted: false,
			...(manufacturingOrder && {
				mo_no: manufacturingOrder
			}),
			...(inboundDeviceSerialNumber && {
				inbound_device_sn: inboundDeviceSerialNumber,
				inbound_at: null
			}),
			...(outboundDeviceSerialNumber && {
				outbound_device_sn: outboundDeviceSerialNumber,
				outbound_at: null,
				po: null
			})
		}

		const paginateResult = await this.inventoryEpcModel.paginate(filterQuery, {
			// leanWithId: false,
			sort: { last_scanned_at: -1, epc: 1, mo_no: 1 },
			lean: true,
			page: params.page,
			limit: params.limit,
			options: {
				readPreference: 'nearest',
				...(paginationHint && { hint: paginationHint })
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
