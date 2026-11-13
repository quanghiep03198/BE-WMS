import { PURCHASE_ORDERS_SQL } from '../purchase-orders.sql'

describe('purchase order source SQL', () => {
	it('selects one preferred source row per PO before joining order sizes', () => {
		expect(PURCHASE_ORDERS_SQL).toMatch(
			/ROW_NUMBER\(\)\s+OVER\s*\(\s*PARTITION BY\s+source\.po\s+ORDER BY\s+\(CASE WHEN source\.ship_type IS NOT NULL THEN 1 ELSE 0 END\s*\+\s*CASE WHEN source\.destCountry IS NOT NULL THEN 1 ELSE 0 END\)\s+DESC/i
		)
		expect(PURCHASE_ORDERS_SQL).toMatch(
			/FROM\s+DV_DATA_LAKE\.dbo\.dv_OrderProcessR05 AS source[\s\S]+?INNER JOIN\s+CTE_PO_SOURCE AS orp05\s+ON\s+orp05\.po\s*=\s*IIF\s*\([\s\S]+?AND\s+orp05\.source_rank\s*=\s*1[\s\S]+?ta_ordersizerun/i
		)
	})

	it('uses the exported purchase order fields as stable tie-breakers', () => {
		const ranking = PURCHASE_ORDERS_SQL.match(/ROW_NUMBER\(\) OVER \([\s\S]+?\) AS source_rank/i)?.[0]
		expect(ranking).toBeDefined()
		for (const field of [
			'ship_type',
			'destCountry',
			'po_totalqty',
			'brand',
			'shoestyle_codefactory',
			'shoestyle_codecust',
			'shoestyle_namecust',
			'color_sn'
		]) {
			expect(ranking).toMatch(new RegExp(`source\\.${field}\\b`, 'i'))
		}
	})
})
