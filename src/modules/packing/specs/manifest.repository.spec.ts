import 'reflect-metadata'
import type { ManifestRow } from '../manifest/manifest.repository'
import { ManifestRepository } from '../manifest/manifest.repository'

describe('manifest repository', () => {
	it('uses the same parameterized filters for counts, pages and export batches', async () => {
		const query = jest
			.fn()
			.mockResolvedValueOnce([{ total: 1 }])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
		const repository = new ManifestRepository({ query } as never)
		const filter = { po: 'A%_', target_box_qtyFrom: 2 }
		await repository.count('VA1', filter)
		await repository.page('VA1', { ...filter, page: 2, pageSize: 20, sortBy: 'po', sortOrder: 'DESC' })
		await repository.batch('VA1', filter)
		for (const [sql, params] of query.mock.calls) {
			expect(sql).toContain("[po] LIKE @1 ESCAPE '~'")
			expect(sql).toContain('[target_box_qty] >= @2')
			expect(params.slice(0, 3)).toEqual(['VA1', '%A~%~_%', 2])
		}
		expect(query.mock.calls[1][0]).toContain(
			'ORDER BY [po] DESC, [cust_shoes_style] ASC, [brand_name] ASC, [factory_shoes_style] ASC, [color_sn] ASC, [cursor_id] ASC'
		)
		expect(query.mock.calls[1][0]).toContain('OFFSET @3 ROWS FETCH NEXT @4 ROWS ONLY')
		expect(query.mock.calls[2][0]).toContain('ORDER BY [cust_shoes_style] ASC, [cursor_id] ASC')
		expect(query.mock.calls[1][0]).toContain('pk.Size AS original_size_data')
	})

	it('rejects a sort direction that has not passed the API validator', async () => {
		const repository = new ManifestRepository({ query: jest.fn() } as never)
		await expect(
			repository.page('VA1', { page: 1, pageSize: 20, sortBy: 'po', sortOrder: 'DESC; DROP TABLE X' } as never)
		).rejects.toThrow('Invalid manifest sort direction')
	})

	it.each(['cust_shoes_style', 'brand_name', 'factory_shoes_style', 'color_sn'])(
		'does not repeat %s in the SQL Server order list',
		async (sortBy) => {
			const query = jest.fn().mockResolvedValue([])
			const repository = new ManifestRepository({ query } as never)
			await repository.page('VA1', { page: 1, pageSize: 20, sortBy, sortOrder: 'DESC' } as never)
			const order = query.mock.calls[0][0].split('ORDER BY ').pop().split(' OFFSET')[0]
			expect(order.match(new RegExp(`\\[${sortBy}\\]`, 'g'))).toHaveLength(1)
		}
	)

	it('uses parameterized composite keysets and handles null group fields', async () => {
		const query = jest.fn().mockResolvedValue([])
		const repository = new ManifestRepository({ query } as never)
		const cursor = {
			cust_shoes_style: "Style'%",
			cursor_id: 7,
			brand_name: null,
			factory_shoes_style: null,
			color_sn: 'blue'
		} as ManifestRow
		await repository.batch('VA1', {}, cursor)
		const [sql, parameters] = query.mock.calls[0]
		expect(sql).toContain('[brand_name] IS NULL')
		expect(sql).toContain('[brand_name] IS NOT NULL')
		expect(sql).not.toContain("Style'%")
		expect(parameters).toContain("Style'%")
		expect(parameters).toContain(7)
		expect(parameters).toContain('blue')
	})
})
