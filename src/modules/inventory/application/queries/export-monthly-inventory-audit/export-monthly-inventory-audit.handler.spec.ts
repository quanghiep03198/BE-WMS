import { Workbook } from 'exceljs'
import type { I18nService } from 'nestjs-i18n'
import type { IInventoryAuditRepository } from '../../ports/inventory-audit.repository.port'
import { ExportMonthlyInventoryAuditHandler } from './export-monthly-inventory-audit.handler'
import { ExportMonthlyInventoryAuditQuery } from './export-monthly-inventory-audit.query'

it('exports nonempty inventory records from the report response', async () => {
	const record = {
		mo_no: 'MO-01',
		order_qty: 10,
		storage_locations: ['WH-1', 'WH-2'],
		brand_name: 'BRAND',
		factory_shoes_style: 'STYLE',
		cust_shoes_style: 'CUSTOM',
		color_sn: 'BLACK',
		inventory_closure_status: 'completed' as const,
		beginning_inventory_qty: 5,
		total_stocked_in_qty: 0,
		total_shipped_out_qty: 0,
		total_supplemental_qty: 0,
		final_inventory_qty: 5,
		size_ledger: []
	}
	const repository: Pick<IInventoryAuditRepository, 'getMonthlyInventoryAudit'> = {
		getMonthlyInventoryAudit: async () => ({
			values: [{ ...record, mo_no: 'EMPTY', beginning_inventory_qty: 0, final_inventory_qty: 0 }, record],
			isPlaceholder: false
		})
	}
	const handler = new ExportMonthlyInventoryAuditHandler(
		repository as IInventoryAuditRepository,
		{ t: (key: string) => key } as I18nService
	)
	const buffer = await handler.execute(new ExportMonthlyInventoryAuditQuery('2026-11-15', 'VB2'))
	const workbook = new Workbook()
	await workbook.xlsx.load(buffer)
	const values = workbook.worksheets[0].getColumn(1).values
	expect(values).toContain('MO-01')
	expect(values).not.toContain('EMPTY')
	expect(workbook.worksheets[0].getCell('E3').value).toBe('WH-1, WH-2')
	expect(workbook.worksheets[0].getCell('G3').value).toBe(5)
	expect(workbook.worksheets[0].getCell('K3').value).toBe(5)
})
