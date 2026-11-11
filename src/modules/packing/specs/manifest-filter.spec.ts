import 'reflect-metadata'
import { buildManifestFilter, manifestSortColumn } from '../manifest/manifest-filter'
import { manifestFilterValidator, manifestListValidator } from '../manifest/manifest-filter.dto'

describe('packing manifest filters', () => {
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

	it('always fixes the page size at 20 while validating supplied values', () => {
		const defaults = manifestListValidator.parse({})
		expect(defaults.page).toBe(1)
		expect(defaults.pageSize).toBe(20)
		expect(manifestListValidator.safeParse({ page: 0, pageSize: 101 }).success).toBe(false)
		expect(manifestListValidator.parse({ page: '2', pageSize: '40' }).pageSize).toBe(20)
		expect(manifestListValidator.parse({ pageSize: '1' }).pageSize).toBe(20)
	})

	it('rejects non-finite and empty numeric filter values', () => {
		expect(manifestFilterValidator.safeParse({ standard_weightFrom: 'abc' }).success).toBe(false)
		expect(manifestFilterValidator.safeParse({ standard_weightFrom: '' }).success).toBe(false)
	})
})
