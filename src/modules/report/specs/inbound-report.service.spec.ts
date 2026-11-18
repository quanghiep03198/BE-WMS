import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { InboundReportService } from '../services/inbound-report.service'

function createService() {
	const exec = jest.fn().mockResolvedValue([])
	const query = {
		populate: jest.fn().mockReturnThis(),
		lean: jest.fn().mockReturnThis(),
		exec
	}
	const find = jest.fn().mockReturnValue(query)
	const service = new InboundReportService(
		{ debug: jest.fn() } as never,
		{} as never,
		{ find } as never,
		{} as never,
		{} as never,
		{} as never
	)
	return { service, find }
}

describe('InboundReportService.getDailyInventoryLedger', () => {
	it('queries only ledgers with at least one explicitly non-voided transaction', async () => {
		const { service, find } = createService()
		await service.getDailyInventoryLedger('2026-11-17')

		expect(find).toHaveBeenCalledWith({
			date: '2026-11-17',
			$expr: {
				$anyElementTrue: [
					{
						$map: {
							input: { $objectToArray: { $ifNull: ['$transaction_history', {}] } },
							as: 'transaction',
							in: { $eq: ['$$transaction.v.voided', false] }
						}
					}
				]
			}
		})
	})
})

const mongoUri = process.env.REPORT_TEST_MONGO_URI
const integration = mongoUri ? describe : describe.skip

integration('daily inbound ledger MongoDB filter', () => {
	it('includes mixed and active histories but excludes voided, empty, missing and other dates', async () => {
		if (!mongoUri) throw new Error('REPORT_TEST_MONGO_URI is required')
		const client = new mongoose.mongo.MongoClient(mongoUri)
		const database = client.db(`inbound_report_test_${randomUUID().replaceAll('-', '')}`)
		try {
			await client.connect()
			const collection = database.collection('ledgers')
			await collection.insertMany([
				{ name: 'active', date: '2026-11-17', transaction_history: { a: { voided: false } } },
				{ name: 'mixed', date: '2026-11-17', transaction_history: { a: { voided: true }, b: { voided: false } } },
				{ name: 'voided', date: '2026-11-17', transaction_history: { a: { voided: true } } },
				{ name: 'empty', date: '2026-11-17', transaction_history: {} },
				{ name: 'missing', date: '2026-11-17' },
				{ name: 'null', date: '2026-11-17', transaction_history: null },
				{ name: 'unspecified', date: '2026-11-17', transaction_history: { a: {} } },
				{ name: 'other-date', date: '2026-11-16', transaction_history: { a: { voided: false } } }
			])
			const { service, find } = createService()
			await service.getDailyInventoryLedger('2026-11-17')
			const filter = find.mock.calls[0][0]
			const matches = await collection.find(filter).sort({ name: 1 }).toArray()
			expect(matches.map((document) => document.name)).toEqual(['active', 'mixed'])
		} finally {
			await database.dropDatabase()
			await client.close()
		}
	})
})
