import { Types } from 'mongoose'
import { Readable } from 'node:stream'
import { runFinishedGoodsEpcStep } from '../finished-goods-epcs'

const locationId = new Types.ObjectId('000000000000000000000010')
const departmentId = new Types.ObjectId('000000000000000000000020')
const fallbackLocationId = new Types.ObjectId('000000000000000000000001')
const fallbackDepartmentId = new Types.ObjectId('000000000000000000000002')
const locations = [
	{ _id: locationId, storage_num: 'S01' },
	{ _id: fallbackLocationId, storage_num: 'OTHER' }
]
const departments = [
	{ _id: departmentId, code: 'VB2-BA01' },
	{ _id: fallbackDepartmentId, code: 'OTHER' }
]

const inbound = {
	epc: '303400000000000000000001',
	mo_no: '15MO-1',
	size_numcode: '05',
	po: null,
	factory_shoes_style: 'STYLE-1',
	color_sn: 'BLACK',
	inbound_device_sn: 'INBOUND-DEVICE',
	outbound_device_sn: null,
	last_scanned_at: '2026-11-11T03:00:00.000Z',
	inbound_at: '2026-11-11T03:00:00.000Z',
	outbound_at: null,
	storage_location: 'S01',
	assembly_line: 'VB2-BA01',
	inbound_times: 1,
	status: 'instock',
	rfid_status: 'A'
}

function harness(rows: unknown[], writeError?: Error, streamError?: Error, references = { locations, departments }) {
	const parameters: Record<string, string> = {}
	let sql = ''
	const operations: unknown[] = []
	const referenceReads: string[] = []
	const pool = {
		request: () => ({
			input: (name: string, value: string) => {
				parameters[name] = value
			},
			toReadableStream: () =>
				Readable.from(
					(async function* () {
						yield* rows
						if (streamError) throw streamError
					})()
				),
			query: async (query: string) => {
				sql = query
			},
			cancel: () => true
		})
	}
	const database = {
		collection: (name: string) => {
			if (name === 'storage_locations' || name === 'departments') {
				const documents = name === 'storage_locations' ? references.locations : references.departments
				return {
					find: () => {
						referenceReads.push(name)
						return { toArray: async () => documents }
					}
				}
			}
			expect(name).toBe('finished_goods_epcs')
			return {
				bulkWrite: async (batch: unknown[]) => {
					operations.push(...batch)
					if (writeError) throw writeError
					return { isOk: () => true }
				}
			}
		}
	}
	return {
		pool,
		database,
		parameters,
		operations,
		referenceReads,
		get sql() {
			return sql
		}
	}
}

describe('runFinishedGoodsEpcStep', () => {
	it('maps inbound-only EPC rows and upserts them by EPC', async () => {
		const fake = harness([inbound])

		await expect(
			runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
				inboundDeviceSn: 'INBOUND-DEVICE',
				outboundDeviceSn: 'OUTBOUND-DEVICE'
			})
		).resolves.toEqual({ epcs: 1 })

		expect(fake.parameters).toEqual({
			inboundDeviceSn: 'INBOUND-DEVICE',
			outboundDeviceSn: 'OUTBOUND-DEVICE'
		})
		expect(fake.sql).toContain('@inboundDeviceSn')
		expect(fake.sql).toContain('@outboundDeviceSn')
		expect(fake.sql).not.toContain('dv_InvRFIDrecorddet_backup_Daily')
		expect(fake.sql).not.toContain('dv_warehouseccodedet')
		expect(fake.sql).toMatch(/a\.storage\s+AS\s+storage_location/i)
		expect(fake.sql).toMatch(/a\.dept_code\s+AS\s+assembly_line/i)
		expect(fake.operations).toEqual([
			{
				updateOne: {
					filter: { epc: inbound.epc },
					update: {
						$set: {
							epc: inbound.epc,
							mo_no: inbound.mo_no,
							size_numcode: inbound.size_numcode,
							po: null,
							factory_shoes_style: inbound.factory_shoes_style,
							color_sn: inbound.color_sn,
							inbound_device_sn: 'INBOUND-DEVICE',
							outbound_device_sn: null,
							last_scanned_at: new Date('2026-11-11T03:00:00.000Z'),
							inbound_at: new Date('2026-11-11T03:00:00.000Z'),
							outbound_at: null,
							storage_location: locationId,
							assembly_line: departmentId,
							inbound_times: 1,
							status: 'instock',
							updated_at: expect.any(Date)
						},
						$setOnInsert: {
							created_at: expect.any(Date),
							scannable: true,
							deleted: false
						}
					},
					upsert: true
				}
			}
		])
	})

	it('maps outbound EPC data and gives shipped status precedence over recalled status', async () => {
		const fake = harness([
			{
				...inbound,
				rfid_status: 'B',
				po: 'OUTBOUND-PO',
				outbound_device_sn: 'OUTBOUND-DEVICE',
				outbound_at: '2026-11-11T04:00:00.000Z',
				last_scanned_at: '2026-11-11T04:00:00.000Z',
				status: 'shipped'
			}
		])

		await runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
			inboundDeviceSn: 'INBOUND-DEVICE',
			outboundDeviceSn: 'OUTBOUND-DEVICE'
		})

		const operation = fake.operations[0] as {
			updateOne: { update: { $set: Record<string, unknown> } }
		}
		expect(operation.updateOne.update.$set).toMatchObject({
			po: 'OUTBOUND-PO',
			outbound_device_sn: 'OUTBOUND-DEVICE',
			outbound_at: new Date('2026-11-11T04:00:00.000Z'),
			last_scanned_at: new Date('2026-11-11T04:00:00.000Z'),
			status: 'shipped'
		})
	})

	it('deduplicates inbound and outbound history to the latest scan before joining', async () => {
		const latestInboundAndOutbound = {
			...inbound,
			po: 'LATEST-OUTBOUND-PO',
			inbound_at: '2026-11-11T03:30:00.000Z',
			outbound_device_sn: 'OUTBOUND-DEVICE',
			outbound_at: '2026-11-11T04:30:00.000Z',
			last_scanned_at: '2026-11-11T04:30:00.000Z',
			status: 'shipped'
		}
		const fake = harness([latestInboundAndOutbound])

		await expect(
			runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
				inboundDeviceSn: 'INBOUND-DEVICE',
				outboundDeviceSn: 'OUTBOUND-DEVICE'
			})
		).resolves.toEqual({ epcs: 1 })

		expect(
			fake.sql.match(/ROW_NUMBER\(\) OVER \(PARTITION BY EPC_Code ORDER BY record_time DESC\) AS rn/g)
		).toHaveLength(2)
		expect(fake.sql.match(/WHERE rn = 1/g)).toHaveLength(2)
		expect(fake.operations).toHaveLength(1)
		const operation = fake.operations[0] as {
			updateOne: { update: { $set: Record<string, unknown> } }
		}
		expect(operation.updateOne.update.$set).toMatchObject({
			epc: inbound.epc,
			po: 'LATEST-OUTBOUND-PO',
			inbound_at: new Date('2026-11-11T03:30:00.000Z'),
			outbound_at: new Date('2026-11-11T04:30:00.000Z'),
			last_scanned_at: new Date('2026-11-11T04:30:00.000Z'),
			status: 'shipped'
		})
	})

	it('includes backup rows only when requested', async () => {
		const fake = harness([])

		await runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
			inboundDeviceSn: 'INBOUND-DEVICE',
			outboundDeviceSn: 'OUTBOUND-DEVICE',
			includeBackups: true
		})

		expect(fake.sql.match(/dv_InvRFIDrecorddet_backup_Daily/g)).toHaveLength(2)
		expect(fake.sql).not.toContain('dv_warehouseccodedet')
		expect(fake.sql.match(/a\.storage\s+AS\s+storage_location/gi)).toHaveLength(2)
		expect(fake.sql.match(/a\.dept_code\s+AS\s+assembly_line/gi)).toHaveLength(2)
	})

	it('uses and reports fallback references for null or unmatched source codes', async () => {
		const fake = harness([
			{ ...inbound, storage_location: null, assembly_line: null },
			{ ...inbound, epc: '303400000000000000000002', storage_location: 'UNKNOWN', assembly_line: 'UNKNOWN' }
		])
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		try {
			await runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
				inboundDeviceSn: 'INBOUND-DEVICE',
				outboundDeviceSn: 'OUTBOUND-DEVICE'
			})
			for (const operation of fake.operations as Array<{ updateOne: { update: { $set: object } } }>) {
				expect(operation.updateOne.update.$set).toMatchObject({
					storage_location: fallbackLocationId,
					assembly_line: fallbackDepartmentId
				})
			}
			expect(warn.mock.calls.flat().join(' ')).toMatch(/storage.*2/i)
			expect(warn.mock.calls.flat().join(' ')).toMatch(/assembly.*2/i)
		} finally {
			warn.mockRestore()
		}
	})

	it('selects the lowest ObjectId for duplicate codes and warns', async () => {
		const duplicateLocationId = new Types.ObjectId('000000000000000000000005')
		const duplicateDepartmentId = new Types.ObjectId('000000000000000000000006')
		const fake = harness([inbound], undefined, undefined, {
			locations: [...locations, { _id: duplicateLocationId, storage_num: 'S01' }],
			departments: [...departments, { _id: duplicateDepartmentId, code: 'VB2-BA01' }]
		})
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		try {
			await runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
				inboundDeviceSn: 'INBOUND-DEVICE',
				outboundDeviceSn: 'OUTBOUND-DEVICE'
			})
			const operation = fake.operations[0] as { updateOne: { update: { $set: object } } }
			expect(operation.updateOne.update.$set).toMatchObject({
				storage_location: duplicateLocationId,
				assembly_line: duplicateDepartmentId
			})
			expect(warn.mock.calls.flat().join(' ')).toMatch(/duplicate/i)
		} finally {
			warn.mockRestore()
		}
	})

	it('normalizes source codes and loads references only once for multiple batches', async () => {
		const rows = Array.from({ length: 1001 }, (_, index) => ({
			...inbound,
			epc: `epc-${index}`,
			storage_location: ' s01 ',
			assembly_line: ' VB2-BA01 '
		}))
		const fake = harness(rows)
		await expect(
			runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
				inboundDeviceSn: 'INBOUND-DEVICE',
				outboundDeviceSn: 'OUTBOUND-DEVICE'
			})
		).resolves.toEqual({ epcs: 1001 })
		expect(fake.referenceReads).toEqual(['storage_locations', 'departments'])
		expect(fake.operations).toHaveLength(1001)
		const operation = fake.operations[1000] as { updateOne: { update: { $set: object } } }
		expect(operation.updateOne.update.$set).toMatchObject({
			storage_location: locationId,
			assembly_line: departmentId
		})
	})

	it.each([
		{ locations: [], departments },
		{ locations, departments: [] }
	])('fails without writing if a needed reference collection is empty', async (references) => {
		const fake = harness([inbound], undefined, undefined, references)
		await expect(
			runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
				inboundDeviceSn: 'INBOUND-DEVICE',
				outboundDeviceSn: 'OUTBOUND-DEVICE'
			})
		).rejects.toThrow(/reference|collection/i)
		expect(fake.operations).toEqual([])
	})

	it('rejects duplicate EPC input before writing', async () => {
		const fake = harness([inbound, inbound])

		await expect(
			runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
				inboundDeviceSn: 'INBOUND-DEVICE',
				outboundDeviceSn: 'OUTBOUND-DEVICE'
			})
		).rejects.toThrow(`Duplicate finished goods EPC ${inbound.epc}`)
		expect(fake.operations).toEqual([])
	})

	it('propagates Mongo bulk-write errors', async () => {
		const error = new Error('bulk write failed')
		const fake = harness([inbound], error)

		await expect(
			runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
				inboundDeviceSn: 'INBOUND-DEVICE',
				outboundDeviceSn: 'OUTBOUND-DEVICE'
			})
		).rejects.toBe(error)
	})

	it('propagates MSSQL stream errors', async () => {
		const error = new Error('stream failed')
		const fake = harness([], undefined, error)

		await expect(
			runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
				inboundDeviceSn: 'INBOUND-DEVICE',
				outboundDeviceSn: 'OUTBOUND-DEVICE'
			})
		).rejects.toBe(error)
	})
})
