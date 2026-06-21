import { RFIDSearchParams } from '../../infrastructure/types'
import { RestoreArchivedEpcsDTO } from '../../presentation/dto/rfid-shared.dto'
import { ElectronicProductCode } from '../entities/epc.entity'
import { InventoryAction, ScannedOrderDetail } from '../types'

export interface IInoutboundMongoRepository {
	getAllScanningEpcsByOrder(deviceSerialNumber: string, manufacturingOrder: string): Promise<ElectronicProductCode[]>

	getPaginatedScanningEpcs(params: RFIDSearchParams): Promise<Pagination<Record<'epc' | 'mo_no', string>>>

	getScanningManufacturingOrders(
		params: { 'inbound_device_sn.eq': string } | { 'outbound_device_sn.eq': string }
	): Promise<ScannedOrderDetail[]>

	getInternalEpcExist(
		params: { 'inbound_device_sn.eq': string } | { 'outbound_device_sn.eq': string }
	): Promise<boolean>

	updateInboundTimestamp(scannedEpcs: Array<ElectronicProductCode>): Promise<number>

	bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: InventoryAction
		payload: { eProductCodes: ElectronicProductCode[]; deviceSerialNumber: string }
	}): Promise<number>

	deleteScannedOrder(
		action: InventoryAction,
		manufacturingOrder: string,
		deviceSerialNumber: string,
		rescannable: boolean
	): Promise<number>

	bulkDeleteEpcs(inventoryAction: InventoryAction, epcs: string[], rescannable: boolean): Promise<number>

	restoreArchivedEpcs(action: InventoryAction, epcs: RestoreArchivedEpcsDTO): Promise<number>
}

export const IO_MONGO_REPOSITORY = 'IInoutboundMongoRepository'
