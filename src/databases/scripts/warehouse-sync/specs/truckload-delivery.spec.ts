import { Types, mongo } from 'mongoose'
import { Readable, Writable } from 'node:stream'
import { runTruckloadDeliveryStep } from '../truckload-delivery'

function mockGridFS() {
	const files: { _id: Types.ObjectId; filename: string; metadata: Record<string, string>; data: Buffer }[] = []
	let uploadError: Error | undefined
	const bucket = {
		find: (filter: { filename: string; 'metadata.contentType': string; 'metadata.sha256': string }) => ({
			toArray: async () =>
				files.filter(
					(file) =>
						file.filename === filter.filename &&
						file.metadata.contentType === filter['metadata.contentType'] &&
						file.metadata.sha256 === filter['metadata.sha256']
				)
		}),
		openUploadStream: (filename: string, options: { metadata: Record<string, string> }) => {
			const id = new Types.ObjectId()
			const stream = new Writable({
				write(chunk: Buffer, _encoding, callback) {
					if (uploadError) return callback(uploadError)
					files.push({ _id: id, filename, metadata: options.metadata, data: Buffer.from(chunk) })
					callback()
				}
			})
			return Object.assign(stream, { id })
		}
	}
	jest.spyOn(mongo, 'GridFSBucket', 'get').mockReturnValue(
		class {
			constructor(_database: mongo.Db, options: { bucketName: string }) {
				expect(options.bucketName).toBe('dispatch_order_signatures')
				return bucket
			}
		} as unknown as typeof mongo.GridFSBucket
	)
	return { files, failUploads: (error: Error) => (uploadError = error) }
}

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
	afterEach(() => jest.restoreAllMocks())

	it('stores the four source signatures in GridFS and writes their file ids', async () => {
		const gridfs = mockGridFS()
		const harness = createHarness([
			{
				dispatch_order: 'DO-1',
				created_by: '507f1f77bcf86cd799439011',
				packing: '[]',
				ie_signature: 'data:image/jpeg;base64,aWU=',
				warehouse_officer_signature: 'd2FyZWhvdXNl',
				security_1_signature: 'c2VjdXJpdHkx',
				security_2_signature: 'c2VjdXJpdHky'
			}
		])

		await runTruckloadDeliveryStep(harness.pool, harness.database)

		const fields = ['ie_signature', 'warehouse_officer_signature', 'security_1_signature', 'security_2_signature']
		const delivery = (harness.writes[0][0] as { updateOne: { update: { $set: Record<string, unknown> } } }).updateOne
			.update.$set
		expect(gridfs.files).toHaveLength(4)
		expect(gridfs.files.map((file) => file.data.toString())).toEqual(['ie', 'warehouse', 'security1', 'security2'])
		expect(gridfs.files.map((file) => file.metadata.contentType)).toEqual([
			'image/jpeg',
			'image/png',
			'image/png',
			'image/png'
		])
		for (const [index, field] of fields.entries()) {
			expect(gridfs.files[index].filename).toBe(`DO-1.${field}`)
			expect(delivery[field]).toEqual(gridfs.files[index]._id)
		}
	})

	it('reuses unchanged signatures on subsequent syncs and clears empty signatures', async () => {
		const gridfs = mockGridFS()
		const harness = createHarness([
			{
				dispatch_order: 'DO-1',
				created_by: '507f1f77bcf86cd799439011',
				packing: '[]',
				ie_signature: 'aWU=',
				warehouse_officer_signature: '',
				security_1_signature: 'data:image/png;base64,',
				security_2_signature: null
			}
		])

		await runTruckloadDeliveryStep(harness.pool, harness.database)
		await runTruckloadDeliveryStep(harness.pool, harness.database)

		expect(gridfs.files).toHaveLength(1)
		for (const batch of harness.writes) {
			const delivery = (batch[0] as { updateOne: { update: { $set: Record<string, unknown> } } }).updateOne.update
				.$set
			expect(delivery.ie_signature).toEqual(gridfs.files[0]._id)
			expect(delivery.warehouse_officer_signature).toBeNull()
			expect(delivery.security_1_signature).toBeNull()
			expect(delivery.security_2_signature).toBeNull()
		}
	})

	it('does not write a delivery when a signature upload fails', async () => {
		const gridfs = mockGridFS()
		gridfs.failUploads(new Error('GridFS unavailable'))
		const harness = createHarness([
			{ dispatch_order: 'DO-1', created_by: '507f1f77bcf86cd799439011', packing: '[]', ie_signature: 'aWU=' }
		])

		await expect(runTruckloadDeliveryStep(harness.pool, harness.database)).rejects.toThrow('GridFS unavailable')
		expect(harness.writes).toEqual([])
	})

	it('uploads a new file when a signature changes', async () => {
		const gridfs = mockGridFS()
		const row = {
			dispatch_order: 'DO-1',
			created_by: '507f1f77bcf86cd799439011',
			packing: '[]',
			ie_signature: 'aWU='
		}
		const harness = createHarness([row])

		await runTruckloadDeliveryStep(harness.pool, harness.database)
		row.ie_signature = 'bmV3'
		await runTruckloadDeliveryStep(harness.pool, harness.database)

		expect(gridfs.files.map((file) => file.data.toString())).toEqual(['ie', 'new'])
		const second = (harness.writes[1][0] as { updateOne: { update: { $set: Record<string, unknown> } } }).updateOne
			.update.$set
		expect(second.ie_signature).toEqual(gridfs.files[1]._id)
	})

	it('uploads signatures only for the selected duplicate delivery', async () => {
		const gridfs = mockGridFS()
		const harness = createHarness([
			{
				dispatch_order: 'DO-1',
				created_by: '507f1f77bcf86cd799439011',
				packing: '[]',
				license_plate_capture_time: '2026-11-10T09:30:00Z',
				ie_signature: 'bmV3'
			},
			{
				dispatch_order: 'DO-1',
				created_by: '507f1f77bcf86cd799439011',
				packing: '[]',
				license_plate_capture_time: '2026-11-10T08:30:00Z',
				ie_signature: 'b2xk'
			}
		])

		await runTruckloadDeliveryStep(harness.pool, harness.database)
		expect(gridfs.files.map((file) => file.data.toString())).toEqual(['new'])
	})

	it.each(['not base64!', 'aWU=='])(
		'rejects invalid base64 %s instead of storing an unreadable signature',
		async (value) => {
			mockGridFS()
			const harness = createHarness([
				{ dispatch_order: 'DO-1', created_by: '507f1f77bcf86cd799439011', packing: '[]', ie_signature: value }
			])

			await expect(runTruckloadDeliveryStep(harness.pool, harness.database)).rejects.toThrow(/invalid.*base64/i)
			expect(harness.writes).toEqual([])
		}
	)

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
