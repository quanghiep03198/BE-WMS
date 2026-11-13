import { StockTransactionIdMongoGenerator } from './stock-transaction-id-mongo.generator'

describe('StockTransactionIdMongoGenerator', () => {
	const counters = new Map<string, number>()
	const model = {
		findOneAndUpdate: jest.fn(
			(
				filter: { _id: string },
				update: { $inc: { sequence: number } },
				options: { upsert: boolean; new: boolean }
			) => ({
				lean: () => ({
					exec: async () => {
						if (!options.upsert || !options.new || update.$inc.sequence !== 1)
							throw new Error('Invalid counter update')
						const sequence = (counters.get(filter._id) ?? 0) + 1
						counters.set(filter._id, sequence)
						return { _id: filter._id, sequence }
					}
				})
			})
		)
	}
	const generator = new StockTransactionIdMongoGenerator(model as never)

	beforeEach(() => {
		counters.clear()
		jest.useFakeTimers().setSystemTime(new Date(2026, 10, 13, 12))
	})

	afterEach(() => jest.useRealTimers())

	it('allocates independent daily sequences for each transaction type', async () => {
		expect(await generator.nextId('recall')).toBe('RC-261113-001')
		expect(await generator.nextId('stock_in')).toBe('SI-261113-001')
		expect(await generator.nextId('stock_out')).toBe('XF-261113-001')
		expect(await generator.nextId('recall')).toBe('RC-261113-002')
		jest.setSystemTime(new Date(2026, 10, 14, 12))
		expect(await generator.nextId('recall')).toBe('RC-261114-001')
	})

	it('does not truncate the sequence after 999', async () => {
		counters.set('SI-261113', 999)
		expect(await generator.nextId('stock_in')).toBe('SI-261113-1000')
	})

	it('produces distinct IDs for concurrent requests', async () => {
		const ids = await Promise.all(Array.from({ length: 25 }, () => generator.nextId('stock_out')))
		expect(new Set(ids).size).toBe(25)
		expect(ids).toContain('XF-261113-001')
		expect(ids).toContain('XF-261113-025')
	})

	it('propagates counter storage failures', async () => {
		const failure = new Error('counter unavailable')
		model.findOneAndUpdate.mockImplementationOnce(() => ({
			lean: () => ({
				exec: async () => {
					throw failure
				}
			})
		}))
		await expect(generator.nextId('recall')).rejects.toThrow('counter unavailable')
	})
})
