import type { mongo } from 'mongoose'
import { syncMongoWarehouses } from '../mongo-warehouses'
import { runWarehouseStep } from '../run-warehouse-step'

jest.mock('../mongo-warehouses', () => ({
	syncMongoWarehouses: jest.fn()
}))

describe('runWarehouseStep', () => {
	it('reads warehouse capacity from the master table and does not request location capacity', async () => {
		const date = new Date('2026-01-01T00:00:00Z')
		const queries: string[] = []
		const pool = {
			request: () => ({
				input: jest.fn(),
				query: async (sql: string) => {
					queries.push(sql)
					return {
						recordset: sql.includes('FROM DV_DATA_LAKE.dbo.dv_warehouseccodemst')
							? [{ code: 'W1', name: 'KHO', capacity: 42, created_at: date, creator: null }]
							: [{ warehouse_code: 'W1', storage_num: 'S1', name: 'A01', created_at: date, creator: null }]
					}
				}
			})
		}

		await runWarehouseStep(pool, {} as unknown as mongo.Db, 'VB2', 'fallback')

		expect(queries[0]).toContain('dv_warehouseccodemst')
		expect(queries[0]).toMatch(/\bcapacity\b/)
		expect(queries[1]).toContain('dv_warehouseccodedet')
		expect(queries[1]).toMatch(/JOIN\s+DV_DATA_LAKE\.dbo\.dv_warehouseccodemst/i)
		expect(queries[1]).toMatch(/d\.warehouse_num\s*=\s*w\.warehouse_num/i)
		expect(queries[1]).toMatch(/d\.cofactory_code\s*=\s*w\.cofactory_code/i)
		expect(queries[1]).not.toMatch(/\bwarehouse_id\b/i)
		expect(queries[1]).not.toMatch(/\bcapacity\b/i)
		expect(syncMongoWarehouses).toHaveBeenCalledWith(
			expect.anything(),
			[{ code: 'W1', name: 'KHO', capacity: 42, created_at: date, creator: null }],
			[{ warehouse_code: 'W1', storage_num: 'S1', name: 'A01', created_at: date, creator: null }],
			'fallback'
		)
	})
})
