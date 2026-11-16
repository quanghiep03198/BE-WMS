import { Readable } from 'node:stream'
import { runEpcMatchStep } from '../commands/run-epc-match-step'

describe('EPC match batch writes', () => {
	it('uses unordered writes and limits concurrently active batches', async () => {
		let active = 0
		let maximumActive = 0
		const written: string[] = []
		const queries: string[] = []
		const inputs: Array<[string, string]> = []
		const collection = {
			createIndex: async () => 'idx_epc',
			bulkWrite: async (
				operations: Array<{ updateOne: { filter: { epc: string } } }>,
				options: { ordered: boolean }
			) => {
				expect(options.ordered).toBe(false)
				active++
				maximumActive = Math.max(maximumActive, active)
				await new Promise((resolve) => setTimeout(resolve, 5))
				written.push(...operations.map((operation) => operation.updateOne.filter.epc))
				active--
				return { isOk: () => true }
			}
		}
		const database = {
			collection: (name: string) =>
				name === 'manufacturing_orders'
					? {
							find: () => ({
								async *[Symbol.asyncIterator]() {
									yield { mo_no: '14MO' }
								},
								close: async () => undefined
							})
						}
					: name.startsWith('finished_goods_epcs_match_seen_')
						? {
								bulkWrite: async () => ({ isOk: () => true }),
								drop: async () => true
							}
						: collection
		}
		const pool = {
			request: () => ({
				input: (name: string, value: string) => {
					inputs.push([name, value])
				},
				toReadableStream: () =>
					Readable.from(
						Array.from({ length: 5 }, (_, index) => ({
							epc: `EPC${index}`,
							mo_no: '14MO',
							factory_shoes_style: 'STYLE',
							cust_shoes_style: 'CUSTOMER',
							factory_code_produce: 'FACTORY',
							size_numcode: '08',
							color_sn: 'BLACK'
						}))
					),
				query: async (sql: string) => {
					queries.push(sql)
				},
				cancel: () => true
			})
		}
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		try {
			await expect(
				runEpcMatchStep(pool, database as never, { batchSize: 2, chunkSize: 4, concurrency: 2 })
			).resolves.toEqual({ epcMatches: 5 })
			expect(maximumActive).toBe(2)
			expect(written.sort()).toEqual(['EPC0', 'EPC1', 'EPC2', 'EPC3', 'EPC4'])
			expect(
				info.mock.calls
					.filter(([message]) => message === 'EPC match chunk')
					.map(([, value]) => value.rows)
					.sort()
			).toEqual([1, 4])
			written.length = 0
			await expect(
				runEpcMatchStep(pool, database as never, { batchSize: 2, concurrency: 2, maxRows: 3 })
			).resolves.toEqual({ epcMatches: 3 })
			expect(written.sort()).toEqual(['EPC0', 'EPC1', 'EPC2'])
			expect(queries[1]).toMatch(/SELECT TOP \(CAST\(@maxRows AS int\)\) EPC_Code/i)
			expect(queries[1]).toMatch(/ORDER BY EPC_Code/i)
			expect(inputs).toContainEqual(['maxRows', '3'])
		} finally {
			info.mockRestore()
		}
	})
})
