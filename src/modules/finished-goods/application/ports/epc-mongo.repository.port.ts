import { StockFlow, UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { GetScanningEpcsBySizeQuery } from '../queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'

export interface IEpcMongoRepository {
	bulkWriteInventoryEpcs({
		action,
		payload
	}: {
		action: StockFlow
		payload: {
			epcs: Array<{
				epc: string
				mo_no: string
				factory_shoes_style: string
				color_sn: string
				size_numcode: string
				factory_code_produce: string
			}>
			deviceSerialNumber: string
		}
	}): Promise<void>

	getPendingStockMoveEpcs(
		deviceSerialNumber: string,
		manufacturingOrder: string,
		assemblyLine?: `${string}/${string}`,
		storageLocation?: `${string}/${string}`
	): Promise<ElectronicProductCode[]>

	getEpcsInformation(epcs: Array<string>): Promise<
		Array<{
			epc: string
			mo_no: string
			factory_shoes_style: string
			color_sn: string
			size_numcode: string
			factory_code_produce: string
		}>
	>

	getPendingShipOutEpcs(
		purchaseOrder: string,
		manufacturingOrder: string | Array<string>,
		pendingOutboundSizeQuantities?: Array<{ size_numcode: string; qty: number }>
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

	getPendingExchangeEpcs(query: {
		deviceSerialNumber: string
		manufacturingOrder: string
		sizeNumber: string
		quantity: number
	}): Promise<
		Array<{ epc: string; mo_no: string; factory_shoes_style: string; color_sn: string; size_numcode: string }>
	>

	getScanningEpcsBySize(query: GetScanningEpcsBySizeQuery): Promise<Array<{ epc: string }>>

	exchangeManufacturingOrder(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void>

	upsertEpcsMatch(data: UpsertEpcsMatchData, insertOnly?: boolean): Promise<void>
}

export const EPC_MONGO_REPOSITORY = Symbol('IEpcMongoRepository')
