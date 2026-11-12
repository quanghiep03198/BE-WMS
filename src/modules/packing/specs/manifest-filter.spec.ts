import 'reflect-metadata'
import { manifestFilterValidator, manifestListValidator } from '../dto/manifest-filter.dto'
import { buildManifestFilter, manifestSortColumn } from '../helpers/manifest-filter'

describe('packing manifest filters', () => {
	it('supports exact match and full-text search without interpreting input as SQL', () => {
		const filter = manifestListValidator.parse({ 'po:eq': 'PO_1', 'target_box_qty:eq': '5', q: 'a%_' })
		const built = buildManifestFilter(filter, 1)
		expect(built.sql).toContain('[po] = @1')
		expect(built.sql).toContain('[target_box_qty] = @2')
		expect(built.sql).toContain("[brand_name] LIKE @3 ESCAPE '~'")
		expect(built.parameters).toEqual(['PO_1', 5, '%a~%~_%'])
	})

	it('accepts conventional query parameters and maps them to validated filters', () => {
		expect(
			manifestListValidator.parse({
				_page: '2',
				_limit: '15',
				_sort: 'po',
				_order: 'desc',
				'po:contains': 'ABC',
				'standard_weight:gte': '2',
				'standard_weight:lte': '5'
			})
		).toEqual({
			page: 2,
			pageSize: 15,
			sortBy: 'po',
			sortOrder: 'DESC',
			po: 'ABC',
			standard_weightFrom: 2,
			standard_weightTo: 5
		})
	})
	it('escapes SQL Server LIKE wildcards and parameterizes values', () => {
		const result = buildManifestFilter({ po: 'A%_[~B', target_box_qtyFrom: 3 }, 1)
		expect(result.sql).toContain("[po] LIKE @1 ESCAPE '~'")
		expect(result.sql).toContain('[target_box_qty] >= @2')
		expect(result.parameters).toEqual(['%A~%~_~[~~B%', 3])
	})

	it('allows filtering and sorting by customer shoe style', () => {
		const filter = manifestFilterValidator.parse({ cust_shoes_style: 'ABC', sortBy: 'cust_shoes_style' })
		expect(buildManifestFilter(filter, 1)).toEqual({
			sql: "[cust_shoes_style] LIKE @1 ESCAPE '~'",
			parameters: ['%ABC%']
		})
		expect(manifestSortColumn('cust_shoes_style')).toBe('[cust_shoes_style]')
	})

	it('rejects unknown sort columns and query fields', () => {
		expect(() => manifestSortColumn('po]; DROP TABLE PackingPlan;--')).toThrow()
		expect(manifestListValidator.safeParse({ sortBy: 'not_a_column' }).success).toBe(false)
		expect(manifestListValidator.safeParse({ unexpected: 'x' }).success).toBe(false)
	})

	it('defaults to 20 and validates the requested page size', () => {
		const defaults = manifestListValidator.parse({})
		expect(defaults.page).toBe(1)
		expect(defaults.pageSize).toBe(20)
		expect(manifestListValidator.safeParse({ page: 0, pageSize: 101 }).success).toBe(false)
		expect(manifestListValidator.parse({ page: '2', pageSize: '40' }).pageSize).toBe(40)
		expect(manifestListValidator.parse({ pageSize: '1' }).pageSize).toBe(1)
	})

	it('rejects non-finite and empty numeric filter values', () => {
		expect(manifestFilterValidator.safeParse({ standard_weightFrom: 'abc' }).success).toBe(false)
		expect(manifestFilterValidator.safeParse({ standard_weightFrom: '' }).success).toBe(false)
	})
})
