import { StockMovementDirection } from '../../domain/types'
import { ElectronicProductCode } from '../../domain/value-objects/epc.vo'
import { RestoreArchivedEpcsDTO } from '../../presentation/dto/rfid-shared.dto'
import { GetScanningEpcsBySizeQuery } from '../queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'

export interface IIoMongoRepository {
	bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: StockMovementDirection
		payload: { epcs: ElectronicProductCode[]; deviceSerialNumber: string }
	}): Promise<void>

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

	getScanningEpcsBySize(query: GetScanningEpcsBySizeQuery): Promise<Array<{ epc: string }>>

	getPendingExchangeEpcs(query: {
		deviceSerialNumber: string
		manufacturingOrder: string
		sizeNumber: string
		quantity: number
	}): Promise<
		Array<{ epc: string; mo_no: string; factory_shoes_style: string; color_sn: string; size_numcode: string }>
	>

	updateInboundTimestamp(scannedEpcs: Array<ElectronicProductCode>): Promise<void>

	exchangeMo(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void>

	restoreArchivedEpcs(action: StockMovementDirection, epcs: RestoreArchivedEpcsDTO): Promise<void>
}

export const IO_MONGO_REPOSITORY = 'IInoutboundMongoRepository'
