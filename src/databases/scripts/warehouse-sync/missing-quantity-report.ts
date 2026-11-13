import ExcelJS from 'exceljs'

interface ManufacturingOrderSize {
	order_qty: number
	stocked_in_qty: number
	total_recall_tx: number
	total_return_tx: number
	shipped_out_qty: number
}

interface PurchaseOrderSize {
	order_qty: number
	shipped_out_qty: number
}

export interface ManufacturingOrderReportSource {
	mo_no: string
	size_ledger: Record<string, ManufacturingOrderSize>
}

export interface PurchaseOrderReportSource {
	po: string
	shipping_progress: Record<string, PurchaseOrderSize>
}

type Source<T> = Iterable<T> | AsyncIterable<T>

function entries<T>(value: Record<string, T>, identifier: string): Array<[string, T]> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Invalid size data for ${identifier}`)
	}
	return Object.entries(value)
}

function quantity(value: number, identifier: string, field: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error(`Invalid ${field} for ${identifier}`)
	}
	return value
}

export async function buildMissingQuantityWorkbook(
	manufacturingOrders: Source<ManufacturingOrderReportSource>,
	purchaseOrders: Source<PurchaseOrderReportSource>
): Promise<ExcelJS.Workbook> {
	const workbook = new ExcelJS.Workbook()
	const moSheet = workbook.addWorksheet('manufacturing_orders')
	moSheet.addRow([
		'mo_no',
		'size',
		'order_qty',
		'stocked_in_qty',
		'total_recall_tx',
		'total_return_tx',
		'shipped_out_qty',
		'missing_qty',
		'total_missing_qty'
	])
	const poSheet = workbook.addWorksheet('purchase_orders')
	poSheet.addRow(['po', 'size', 'order_qty', 'shipped_out_qty', 'missing_qty', 'total_missing_qty'])

	for await (const order of manufacturingOrders) {
		const sizes = entries(order.size_ledger, order.mo_no).map(([size, value]) => {
			if (!value || typeof value !== 'object') throw new Error(`Invalid size ${size} for ${order.mo_no}`)
			const orderQty = quantity(value.order_qty, order.mo_no, 'order_qty')
			const stocked = quantity(value.stocked_in_qty, order.mo_no, 'stocked_in_qty')
			const recall = quantity(value.total_recall_tx, order.mo_no, 'total_recall_tx')
			const returned = quantity(value.total_return_tx, order.mo_no, 'total_return_tx')
			const shipped = quantity(value.shipped_out_qty, order.mo_no, 'shipped_out_qty')
			return {
				size,
				orderQty,
				stocked,
				recall,
				returned,
				shipped,
				missing: orderQty - (stocked - recall + returned)
			}
		})
		if (!sizes.some((size) => size.missing !== 0)) continue
		const total = sizes.reduce((sum, size) => sum + size.missing, 0)
		for (const size of sizes) {
			moSheet.addRow([
				order.mo_no,
				size.size,
				size.orderQty,
				size.stocked,
				size.recall,
				size.returned,
				size.shipped,
				size.missing,
				total
			])
		}
	}

	for await (const order of purchaseOrders) {
		const sizes = entries(order.shipping_progress, order.po).map(([size, value]) => {
			if (!value || typeof value !== 'object') throw new Error(`Invalid size ${size} for ${order.po}`)
			const orderQty = quantity(value.order_qty, order.po, 'order_qty')
			const shipped = quantity(value.shipped_out_qty, order.po, 'shipped_out_qty')
			return { size, orderQty, shipped, missing: orderQty - shipped }
		})
		if (!sizes.some((size) => size.missing !== 0)) continue
		const total = sizes.reduce((sum, size) => sum + size.missing, 0)
		for (const size of sizes) poSheet.addRow([order.po, size.size, size.orderQty, size.shipped, size.missing, total])
	}

	return workbook
}
