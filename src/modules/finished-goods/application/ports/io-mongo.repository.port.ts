import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { StockFlow, UpsertEpcsMatchData } from '../../domain/types'
import { ElectronicProductCode } from '../../domain/value-objects/epc.vo'
import { GetScanningEpcsBySizeQuery } from '../queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'

export interface IIoMongoRepository {
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
		assemblyLine?: string,
		storageLocation?: string
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

	getMoInventory(manufacturingOrder: string): Promise<
		Array<{
			mo_no: string
			size_numcode: SizeNumber
			order_qty: number
			accumulated_qty: number
		}>
	>

	getPoOutboundProgress(purchaseOrder: string): Promise<
		Array<{
			size_numcode: SizeNumber
			order_qty: number
			accumulated_qty: number
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

	stockIn(pendingStockInEpcs: Array<ElectronicProductCode>): Promise<void>

	stockOut(pendingShipOutEpcs: Array<ElectronicProductCode>): Promise<void>

	recallFromStock(pendingRecallEpcs: Array<ElectronicProductCode>): Promise<void>

	exchangeManufacturingOrder(pendingExchangeEpcs: Array<string>, targetMo: string): Promise<void>

	upsertEpcsMatch(data: UpsertEpcsMatchData, insertOnly?: boolean): Promise<void>

	getPendingInventoryVariation(stockedInEpcs: Array<ElectronicProductCode>): Promise<
		Array<{
			mo_no: string
			inventory_variation: Record<
				string,
				{ stocked_in_qty: number; total_recall_tx: number; total_return_tx: number; shipped_out_qty: number }
			>
		}>
	>
}

export const IO_MONGO_REPOSITORY = Symbol('IInoutboundMongoRepository')
