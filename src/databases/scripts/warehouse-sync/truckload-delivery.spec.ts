import { Types, type mongo } from 'mongoose'
import { Readable } from 'node:stream'
import { runTruckloadDeliveryStep } from './truckload-delivery'

function createHarness(rows: unknown[], userId = new Types.ObjectId()) {
	const parameters = new Map<string, string>()
	const writes: unknown[][] = []
	let sql = ''
	const database = {
		collection: (name: string) => {
			if (name === 'users') {
				return {
					findOne: async (filter: { username: string }) => (filter.username === '1009006' ? { _id: userId } : null)
				}
			}
			return {
				bulkWrite: async (operations: unknown[]) => {
					writes.push(operations)
					return { isOk: () => true }
				}
			}
		}
	} as unknown as mongo.Db
	const pool = {
		request: () => ({
			input: (name: string, value: string) => parameters.set(name, value),
			toReadableStream: () => Readable.from(rows),
			query: async (query: string) => {
				sql = query
			},
			cancel: () => true
		})
	}
	return { database, pool, parameters, writes, getSql: () => sql, userId }
}

describe('runTruckloadDeliveryStep', () => {
	it('maps packing JSON dates and creator ObjectIds and sums outbound quantities', async () => {
		const harness = createHarness([
			{
				dispatch_order: 'DO-1',
				created_by: '507f1f77bcf86cd799439011',
				packing: JSON.stringify([
					{
						po: 'PO-1',
						outbound_qty: 4,
						created_at: '2026-11-10T08:30:00.000Z',
						updated_at: '2026-11-10T09:00:00.000Z',
						created_by: '507f1f77bcf86cd799439012'
					},
					{
						po: 'PO-2',
						outbound_qty: 7,
						created_at: '2026-11-10T09:30:00.000Z',
						updated_at: '2026-11-10T10:00:00.000Z',
						created_by: '507f1f77bcf86cd799439013'
					}
				])
			}
		])

		await expect(runTruckloadDeliveryStep(harness.pool, harness.database)).resolves.toEqual({ deliveries: 1 })

		const operation = (harness.writes[0][0] as { updateOne: Record<string, any> }).updateOne
		expect(operation.filter).toEqual({ dispatch_order: 'DO-1' })
		expect(operation.upsert).toBe(true)
		expect(operation.update.$set).toMatchObject({
			dispatch_order: 'DO-1',
			total_outbound_qty: 11,
			created_by: new Types.ObjectId('507f1f77bcf86cd799439011'),
			packing: [
				{
					po: 'PO-1',
					outbound_qty: 4,
					created_at: new Date('2026-11-10T08:30:00.000Z'),
					updated_at: new Date('2026-11-10T09:00:00.000Z'),
					created_by: new Types.ObjectId('507f1f77bcf86cd799439012')
				},
				{
					po: 'PO-2',
					outbound_qty: 7,
					created_at: new Date('2026-11-10T09:30:00.000Z'),
					updated_at: new Date('2026-11-10T10:00:00.000Z'),
					created_by: new Types.ObjectId('507f1f77bcf86cd799439013')
				}
			]
		})
	})

	it('looks up the default creator and binds its id in a read-only query', async () => {
		const harness = createHarness([])

		await expect(runTruckloadDeliveryStep(harness.pool, harness.database)).resolves.toEqual({ deliveries: 0 })

		expect(harness.parameters.get('createdBy')).toBe(harness.userId.toString())
		expect(harness.getSql()).toMatch(/^\s*SELECT\b/i)
		expect(harness.getSql()).toContain('@createdBy')
		expect(harness.getSql()).not.toContain(harness.userId.toString())
	})

	it('writes one delivery per dispatch order using its latest plate snapshot', async () => {
		const harness = createHarness([
			{
				dispatch_order: 'DO-1',
				factory_code: 'FACTORY-1',
				license_plate_capture_time: '2026-11-10T09:30:00.000Z',
				license_plate_image: 'latest.jpg',
				created_by: '507f1f77bcf86cd799439011',
				packing: '[]'
			},
			{
				dispatch_order: 'DO-1',
				factory_code: 'OLDER-FACTORY',
				license_plate_capture_time: '2026-11-10T08:30:00.000Z',
				license_plate_image: 'older.jpg',
				created_by: '507f1f77bcf86cd799439011',
				packing: '[]'
			}
		])

		await expect(runTruckloadDeliveryStep(harness.pool, harness.database)).resolves.toEqual({ deliveries: 1 })

		expect(harness.writes.flat()).toHaveLength(1)
		const operation = (harness.writes[0][0] as { updateOne: Record<string, any> }).updateOne
		expect(operation.filter).toEqual({ dispatch_order: 'DO-1' })
		expect(operation.update.$set).toMatchObject({
			factory_code: 'FACTORY-1',
			license_plate_capture_time: '2026-11-10T09:30:00.000Z',
			license_plate_image: 'latest.jpg'
		})
		expect(harness.getSql()).toMatch(/OUTER APPLY\s*\(\s*SELECT TOP \(1\) plate\.snap_time,\s*plate\.images/i)
		expect(harness.getSql()).toMatch(/ORDER BY plate\.snap_time DESC,\s*plate\.plate_name ASC,\s*plate\.images ASC/i)
	})

	it('rejects invalid packing data without writing it', async () => {
		const harness = createHarness([
			{ dispatch_order: 'DO-1', created_by: '507f1f77bcf86cd799439011', packing: '[{"outbound_qty":"bad"}]' }
		])

		await expect(runTruckloadDeliveryStep(harness.pool, harness.database)).rejects.toThrow()

		expect(harness.writes).toEqual([])
	})
})
