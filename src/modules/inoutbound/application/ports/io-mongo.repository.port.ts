import { StockMovementDirection } from '../../domain/types'
import { ElectronicProductCode } from '../../domain/value-objects/epc.vo'
import { RestoreArchivedEpcsDTO } from '../../presentation/dto/rfid-shared.dto'

export interface IIoMongoRepository {
	getPendingInboundEpcs(deviceSerialNumber: string, manufacturingOrder: string): Promise<ElectronicProductCode[]>

	getPendingExchangeMos(
		deviceSerialNumber: string,
		sourceMos: string[]
	): Promise<
		Array<{
			epcs: Array<string>
			mo_no: string
			factory_shoes_style: string
			color_sn: string
			sizes: Array<string>
		}>
	>

	updateInboundTimestamp(scannedEpcs: Array<ElectronicProductCode>): Promise<void>

	bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: StockMovementDirection
		payload: { epcs: ElectronicProductCode[]; deviceSerialNumber: string }
	}): Promise<void>

	deletePendingInboundMo(
		port: StockMovementDirection,
		manufacturingOrder: string,
		deviceSerialNumber: string,
		rescannable: boolean
	): Promise<void>

	bulkDeleteEpcs(inventoryAction: StockMovementDirection, epcs: string[], rescannable: boolean): Promise<void>

	restoreArchivedEpcs(action: StockMovementDirection, epcs: RestoreArchivedEpcsDTO): Promise<void>

	exchangeMo(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void>
}

export const IO_MONGO_REPOSITORY = 'IInoutboundMongoRepository'
