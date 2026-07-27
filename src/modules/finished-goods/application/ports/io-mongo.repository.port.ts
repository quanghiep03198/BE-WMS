import { StockFlow, UpsertEpcsMatchData } from '../../domain/types'
import { ElectronicProductCode } from '../../domain/value-objects/epc.vo'
import { GetScanningEpcsBySizeQuery } from '../queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'

export interface IIoMongoRepository {
	bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: StockFlow
		payload: { epcs: ElectronicProductCode[]; deviceSerialNumber: string }
	}): Promise<void>

	getPendingInboundOrRecallEpcs(
		deviceSerialNumber: string,
		manufacturingOrder: string,
		assemblyLine: string,
		storageLocation: string
	): Promise<ElectronicProductCode[]>

	getPendingOutboundEpcs(
		purchaseOrder: string,
		manufacturingOrder: string | Array<string>,
		pendingOutboundSizeQuantities: Array<{ size_numcode: string; qty: number }>
	): Promise<ElectronicProductCode[]>

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
		// sizeNumber: string
		quantity: number
	}): Promise<
		Array<{ epc: string; mo_no: string; factory_shoes_style: string; color_sn: string; size_numcode: string }>
	>

	stockIn(scannedEpcs: Array<ElectronicProductCode>): Promise<void>

	stockOut(scannedEpcs: Array<ElectronicProductCode>): Promise<void>

	exchangeMo(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void>

	updateScanningEpcsMatch(data: UpsertEpcsMatchData): Promise<void>

	getInventoryVariation(stockedInEpcs: Array<ElectronicProductCode>): Promise<
		Array<{
			mo_no: string
			inventory_variation: Record<
				string,
				{ stocked_in_qty: number; recalled_qty: number; returned_qty: number; shipped_out_qty: number }
			>
		}>
	>
}

export const IO_MONGO_REPOSITORY = 'IInoutboundMongoRepository'
