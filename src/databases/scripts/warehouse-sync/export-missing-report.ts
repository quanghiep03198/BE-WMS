import { randomUUID } from 'node:crypto'
import { link, open, unlink } from 'node:fs/promises'
import {
	buildMissingQuantityWorkbook,
	type ManufacturingOrderReportSource,
	type PurchaseOrderReportSource
} from './missing-quantity-report'

type Source<T> = Iterable<T> | AsyncIterable<T>

export async function exportMissingReport(
	manufacturingOrders: Source<ManufacturingOrderReportSource>,
	purchaseOrders: Source<PurchaseOrderReportSource>,
	filename: string
): Promise<{
	manufacturingOrders: number
	purchaseOrders: number
	missingManufacturingOrders: number
	missingPurchaseOrders: number
}> {
	let moCount = 0
	let poCount = 0
	async function* countMo() {
		for await (const document of manufacturingOrders) {
			moCount++
			yield document
		}
	}
	async function* countPo() {
		for await (const document of purchaseOrders) {
			poCount++
			yield document
		}
	}

	const workbook = await buildMissingQuantityWorkbook(countMo(), countPo())
	if (!moCount) throw new Error('Cannot export: no manufacturing orders')
	if (!poCount) throw new Error('Cannot export: no purchase orders')

	const moSheet = workbook.getWorksheet('manufacturing_orders')
	const poSheet = workbook.getWorksheet('purchase_orders')
	if (!moSheet || !poSheet) throw new Error('Missing workbook sheets')
	const moIds = new Set<string>()
	const poIds = new Set<string>()
	moSheet.eachRow((row, index) => {
		if (index > 1) moIds.add(String(row.getCell(1).value))
	})
	poSheet.eachRow((row, index) => {
		if (index > 1) poIds.add(String(row.getCell(1).value))
	})

	const temporary = `${filename}.${randomUUID()}.tmp`
	const handle = await open(temporary, 'wx')
	try {
		await handle.close()
		await workbook.xlsx.writeFile(temporary)
		await link(temporary, filename)
	} finally {
		await unlink(temporary)
	}
	return {
		manufacturingOrders: moCount,
		purchaseOrders: poCount,
		missingManufacturingOrders: moIds.size,
		missingPurchaseOrders: poIds.size
	}
}
