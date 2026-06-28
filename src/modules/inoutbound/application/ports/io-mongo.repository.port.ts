import { InventoryAction } from '../../domain/types'
import { ElectronicProductCode } from '../../domain/value-objects/epc.vo'
import { RestoreArchivedEpcsDTO } from '../../presentation/dto/rfid-shared.dto'

export interface IIoMongoRepository {
	getPendingInboundEpcs(deviceSerialNumber: string, manufacturingOrder: string): Promise<ElectronicProductCode[]>

	updateInboundTimestamp(scannedEpcs: Array<ElectronicProductCode>): Promise<void>

	bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: InventoryAction
		payload: { epcs: ElectronicProductCode[]; deviceSerialNumber: string }
	}): Promise<void>

	deletePendingInboundMo(
		port: InventoryAction,
		manufacturingOrder: string,
		deviceSerialNumber: string,
		rescannable: boolean
	): Promise<void>

	bulkDeleteEpcs(inventoryAction: InventoryAction, epcs: string[], rescannable: boolean): Promise<void>

	restoreArchivedEpcs(action: InventoryAction, epcs: RestoreArchivedEpcsDTO): Promise<void>
}

export const IO_MONGO_REPOSITORY = 'IInoutboundMongoRepository'
