import { Readable } from 'node:stream'
import { runManufacturingOrderStep } from '../run-manufacturing-order-step'

describe('runManufacturingOrderStep', () => {
	it('warns when no eligible MO from prefix 14 onward matches the factory', async () => {
		const parameters: Record<string, string> = {}
		let query = ''
		const pool = {
			request: () => ({
				input: (name: string, value: string) => {
					parameters[name] = value
				},
				toReadableStream: () => Readable.from([]),
				query: async (sql: string) => {
					query = sql
				},
				cancel: () => true
			})
		}
		const database = { collection: () => ({ createIndex: async () => undefined }) }
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			expect(
				await runManufacturingOrderStep(pool, database as never, 'GL3', new Date('2026-11-11T17:00:00Z'))
			).toEqual({ manufacturingOrders: 0 })
			expect(parameters).toEqual({ FactoryCode: 'GL3', cutoff: '2026-11-12' })
			expect(query).toMatch(/TRY_CONVERT\(int,\s*LEFT\(a\.mo_no,\s*2\)\)\s*>=\s*14/i)
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('14'))
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('GL3'))
		} finally {
			warn.mockRestore()
		}
	})

	it.each(['13ABC', 'A4ABC'])('rejects an ineligible MO row %s', async (moNo) => {
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () =>
					Readable.from([
						{
							mo_no: moNo,
							brand_name: 'UGG',
							factory_code_produce: 'GL3',
							factory_shoes_style: 'F1',
							cust_shoes_style: 'C1',
							color_sn: 'BLACK',
							order_qty: 5,
							size_ledger: JSON.stringify({
								'7': {
									order_qty: 5,
									stocked_in_qty: 2,
									total_recall_tx: 0,
									total_return_tx: 0,
									shipped_out_qty: 1
								}
							})
						}
					]),
				query: async () => undefined,
				cancel: () => true
			})
		}
		const database = {
			collection: () => ({ createIndex: async () => undefined, bulkWrite: async () => ({ isOk: () => true }) })
		}

		await expect(
			runManufacturingOrderStep(pool, database as never, 'GL3', new Date('2026-11-11T17:00:00Z'))
		).rejects.toThrow(/unexpected or duplicate MO/i)
	})
})
