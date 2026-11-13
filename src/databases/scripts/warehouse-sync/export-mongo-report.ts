import { type mongo } from 'mongoose'
import { exportMissingReport } from './export-missing-report'
import type { ManufacturingOrderReportSource, PurchaseOrderReportSource } from './missing-quantity-report'

export async function exportMongoMissingReport(database: mongo.Db, filename: string) {
	const manufacturingOrders = database
		.collection<ManufacturingOrderReportSource>('manufacturing_orders')
		.find({}, { projection: { _id: 0, mo_no: 1, size_ledger: 1 } })
	const purchaseOrders = database
		.collection<PurchaseOrderReportSource>('purchase_orders')
		.find({}, { projection: { _id: 0, po: 1, shipping_progress: 1 } })
	try {
		return await exportMissingReport(manufacturingOrders, purchaseOrders, filename)
	} finally {
		await Promise.all([manufacturingOrders.close(), purchaseOrders.close()])
	}
}
