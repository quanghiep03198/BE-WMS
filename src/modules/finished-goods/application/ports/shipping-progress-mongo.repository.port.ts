import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'

export interface IShippingProgressMongoRepository {
	getPendingShippingFluctuation(scannedEpcs: Array<ElectronicProductCode>): Promise<
		Array<{
			mo_no: string
			po: string | null | undefined
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			size_ledger: Record<string, { shipped_out_qty: number }>
		}>
	>

	getPoOutboundProgress(
		purchaseOrder: string
	): Promise<Array<{ size_numcode: string; order_qty: number; accumulated_qty: number }>>

	applyShippingProgressForStockOut(
		pendingInventoryFluctuation: Array<{
			mo_no: string
			po: string | null | undefined
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			size_ledger: Record<string, { shipped_out_qty: number }>
		}>
	): Promise<void>
}

export const SHIPPING_PROGRESS_MONGO_REPOSITORY = Symbol('IShippingProgressMongoRepository')
