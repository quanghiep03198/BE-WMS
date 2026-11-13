import { Readable } from 'node:stream'
import { runManufacturingOrderStep } from '../run-manufacturing-order-step'

describe('runManufacturingOrderStep', () => {
	it('warns when the requested prefix and factory have no matching orders', async () => {
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () => Readable.from([]),
				query: async () => undefined,
				cancel: () => true
			})
		}
		const database = { collection: () => ({ createIndex: async () => undefined }) }
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			expect(
				await runManufacturingOrderStep(pool, database as never, 'GL3', new Date('2026-11-11T17:00:00Z'), '15')
			).toEqual({ manufacturingOrders: 0 })
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('15'))
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('GL3'))
		} finally {
			warn.mockRestore()
		}
	})
})
