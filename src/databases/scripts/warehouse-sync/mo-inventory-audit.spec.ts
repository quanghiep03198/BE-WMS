import type { mongo } from 'mongoose'
import { Readable } from 'node:stream'
import { runMoInventoryAuditStep } from './mo-inventory-audit'

type AuditRow = {
	mo_no: string
	storage_locations: string | null
	size_ledger: string
	year_month: string
}

function createPool(rows: AuditRow[]) {
	const parameters: Record<string, string>[] = []
	const queries: string[] = []
	return {
		parameters,
		queries,
		request: () => {
			const requestParameters: Record<string, string> = {}
			parameters.push(requestParameters)
			return {
				input: (name: string, value: string) => {
					requestParameters[name] = value
				},
				toReadableStream: () => Readable.from(rows),
				query: async (sql: string) => {
					queries.push(sql)
				},
				cancel: () => true
			}
		}
	}
}

function createMemoryDatabase(locationNames: Record<string, string> = { 'location-a': 'A01' }) {
	const documents = new Map<string, Record<string, unknown>>()
	let nextId = 1
	const auditCollection = {
		bulkWrite: jest.fn(async (operations: Array<Record<string, any>>) => {
			for (const operation of operations) {
				const { filter, update } = operation.updateOne
				const key = JSON.stringify([filter.mo_no, filter.year_month])
				const current = documents.get(key) ?? { _id: `audit-${nextId++}` }
				documents.set(key, { ...current, ...update.$set })
			}
			return { isOk: () => true }
		}),
		aggregate: jest.fn(() => ({
			toArray: async () => {
				for (const document of documents.values()) {
					if (!Array.isArray(document.storage_locations)) continue
					if (!document.storage_locations.some((name) => typeof name === 'string')) continue
					const names = document.storage_locations
						.filter((name): name is string => typeof name === 'string')
						.map((name) => name.trim().toUpperCase())
					document.storage_locations = names.flatMap((name) => {
						const match = Object.entries(locationNames).find(
							([, locationName]) => locationName.trim().toUpperCase() === name
						)
						return match ? [match[0]] : []
					})
				}
				return []
			}
		}))
	}
	const database = {
		collection: (name: string) => {
			if (name !== 'mo_inventory_audit') throw new Error(`Unexpected collection ${name}`)
			return auditCollection
		}
	}
	return {
		database: database as unknown as mongo.Db,
		documents,
		auditCollection
	}
}

function findAuditDocument(documents: Map<string, Record<string, unknown>>, moNo: string, yearMonth: string) {
	return [...documents.values()].find((document) => document.mo_no === moNo && document.year_month === yearMonth)
}

const auditRow: AuditRow = {
	mo_no: '15001',
	storage_locations: '[" a01 ", "Missing"]',
	size_ledger: JSON.stringify({
		'8': {
			order_qty: 12,
			beginning_inventory_qty: 2,
			stocked_in_qty: 4,
			shipped_out_qty: 1,
			supplemental_stocked_in_qty: 3,
			supplemental_shipped_out_qty: 1
		}
	}),
	year_month: '2026-10'
}

describe('runMoInventoryAuditStep', () => {
	it('streams parameterized SELECT rows and stores parsed audit fields', async () => {
		const pool = createPool([auditRow])
		const { database, documents } = createMemoryDatabase()

		await expect(runMoInventoryAuditStep(pool, database, 'VB2')).resolves.toEqual({ audits: 1 })

		expect(pool.parameters).toEqual([{ FactoryCode: 'VB2' }])
		expect(pool.queries).toHaveLength(1)
		expect(pool.queries[0]).toMatch(/^\s*WITH\b/i)
		expect(pool.queries[0]).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC(?:UTE)?)\b/i)
		expect(findAuditDocument(documents, '15001', '2026-10')).toMatchObject({
			mo_no: '15001',
			year_month: '2026-10',
			size_ledger: {
				'8': {
					order_qty: 12,
					beginning_inventory_qty: 2,
					stocked_in_qty: 4
				}
			}
		})
	})

	it('resolves normalized storage-location names to MongoDB references', async () => {
		const { database, documents, auditCollection } = createMemoryDatabase({ 'location-a': 'A01' })

		await runMoInventoryAuditStep(createPool([auditRow]), database, 'VB2')

		expect(findAuditDocument(documents, '15001', '2026-10')?.storage_locations).toEqual(['location-a'])
		expect(auditCollection.aggregate).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					$set: expect.objectContaining({
						storage_locations: expect.objectContaining({
							$map: expect.any(Object)
						})
					})
				}),
				expect.objectContaining({
					$lookup: expect.objectContaining({ from: 'storage_locations' })
				}),
				expect.objectContaining({
					$merge: expect.objectContaining({ into: 'mo_inventory_audit' })
				})
			])
		)
	})

	it('upserts repeat imports without replacing the existing document identity', async () => {
		const { database, documents, auditCollection } = createMemoryDatabase()
		const pool = createPool([auditRow])

		await runMoInventoryAuditStep(pool, database, 'VB2')
		const originalId = findAuditDocument(documents, '15001', '2026-10')?._id
		await runMoInventoryAuditStep(pool, database, 'VB2')

		expect(documents.size).toBe(1)
		expect(findAuditDocument(documents, '15001', '2026-10')?._id).toBe(originalId)
		expect(auditCollection.bulkWrite).toHaveBeenCalledTimes(2)
	})

	it('preserves separate audit documents for the same MO across periods', async () => {
		const laterPeriodRow: AuditRow = {
			...auditRow,
			year_month: '2026-11',
			size_ledger: JSON.stringify({
				'8': {
					order_qty: 20,
					beginning_inventory_qty: 5,
					stocked_in_qty: 6,
					shipped_out_qty: 2,
					supplemental_stocked_in_qty: 4,
					supplemental_shipped_out_qty: 1
				}
			})
		}
		const { database, documents } = createMemoryDatabase()

		await expect(runMoInventoryAuditStep(createPool([auditRow, laterPeriodRow]), database, 'VB2')).resolves.toEqual({
			audits: 2
		})

		expect(documents.size).toBe(2)
		expect(findAuditDocument(documents, '15001', '2026-10')?.size_ledger).toMatchObject({
			'8': { order_qty: 12 }
		})
		expect(findAuditDocument(documents, '15001', '2026-11')?.size_ledger).toMatchObject({
			'8': { order_qty: 20 }
		})
	})

	it('rejects malformed source JSON before writing the row', async () => {
		const invalidRow = { ...auditRow, size_ledger: '{invalid' }
		const { database, documents, auditCollection } = createMemoryDatabase()

		await expect(runMoInventoryAuditStep(createPool([invalidRow]), database, 'VB2')).rejects.toThrow()

		expect(documents.size).toBe(0)
		expect(auditCollection.bulkWrite).not.toHaveBeenCalled()
	})
})
