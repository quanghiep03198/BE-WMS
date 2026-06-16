import { RFIDSearchParams } from '../../infrastructure/types'
import { ElectronicProductCode } from '../entities/epc.entity'
import { ScannedOrderDetail, UploadAction } from '../types'

export interface IRFIDRepository {
	getEPCInformation(epcs: ElectronicProductCode[]): Promise<ElectronicProductCode[]>
	getScanningEPCs(params: RFIDSearchParams): Promise<Pagination<Record<'epc' | 'mo_no', string>>>
	getScanningMOs(
		params: { 'inbound_device_sn.eq': string } | { 'outbound_device_sn.eq': string }
	): Promise<ScannedOrderDetail[]>
	getInternalEPCExist(
		params: { 'inbound_device_sn.eq': string } | { 'outbound_device_sn.eq': string }
	): Promise<boolean>
	bulkWriteInventoryEPCs({
		action,
		payload
	}: {
		action: UploadAction
		payload: {
			eProductCodes: ElectronicProductCode[]
			deviceSerialNumber: string
		}
	}): Promise<void>
}
