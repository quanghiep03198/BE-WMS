import { Types, type mongo } from 'mongoose'
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

function harness(
	rows: unknown[],
	writeError?: Error,
	streamError?: Error,
	references = { locations, departments },
	manufacturingOrders: Array<{ mo_no?: unknown }> = [{ mo_no: '15MO-1' }],
	manufacturingOrdersError?: Error
) {
	const parameters: Record<string, string> = {}
	let sql = ''
	let requestCount = 0
	const operations: unknown[] = []
	const referenceReads: string[] = []
	const staged = new Map<string, Record<string, unknown>>()
	const pool = {
		request: () => {
			requestCount++
			return {
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
			}
		}
	}
	const database = {
		collection: (name: string) => {
			if (name === 'manufacturing_orders') {
				return {
					find: () => ({
						toArray: async () => {
							if (manufacturingOrdersError) throw manufacturingOrdersError
							return manufacturingOrders
						}
					})
				}
			}
			if (name === 'storage_locations' || name === 'departments') {
				const documents = name === 'storage_locations' ? references.locations : references.departments
				return {
					find: () => {
						referenceReads.push(name)
						return { toArray: async () => documents }
					}
				}
			}
			if (name === 'finished_goods_epcs') {
				return { createIndex: async () => 'idx_epc' }
			}
			expect(name).toBe('finished_goods_epcs_staging')
			return {
				bulkWrite: async (batch: Array<{ updateOne: { filter: { _id: string }; update: { $set: object } } }>) => {
					if (writeError) throw writeError
					for (const { updateOne } of batch) staged.set(updateOne.filter._id, updateOne.update.$set)
					return { isOk: () => true }
				},
				aggregate: (pipeline: mongo.Document[]) => ({
					toArray: async () => {
						const ids: string[] = pipeline[0].$match._id.$in
						const resolved = ids.map((id) => {
							const raw = staged.get(id)
							if (!raw) throw new Error(`Missing staged EPC ${id}`)
							const location = references.locations
								.filter((item) => item.storage_num.trim().toUpperCase() === raw.storage_location)
								.sort((a, b) => a._id.toHexString().localeCompare(b._id.toHexString()))[0]?._id
							const department = references.departments
								.filter((item) => item.code.trim() === raw.assembly_line)
								.sort((a, b) => a._id.toHexString().localeCompare(b._id.toHexString()))[0]?._id
							return {
								...raw,
								_match: inbound,
								_location: location,
								_department: department,
								factory_shoes_style: inbound.factory_shoes_style,
								color_sn: inbound.color_sn,
								size_numcode: inbound.size_numcode,
								storage_location:
									location ??
									[...references.locations].sort((a, b) =>
										a._id.toHexString().localeCompare(b._id.toHexString())
									)[0]._id,
								assembly_line:
									department ??
									[...references.departments].sort((a, b) =>
										a._id.toHexString().localeCompare(b._id.toHexString())
									)[0]._id
							}
						})
						if (!pipeline.some((step) => '$merge' in step)) return resolved
						for (const row of resolved) {
							const value: Record<string, unknown> = { ...row }
							delete value._match
							delete value._location
							delete value._department
							operations.push({
								updateOne: {
									filter: { epc: value.epc },
									update: {
										$set: value,
										$setOnInsert: { created_at: value.updated_at, scannable: true, deleted: false }
									},
									upsert: true
								}
							})
						}
						return []
					}
				})
			}
		},
		listCollections: () => ({ hasNext: async () => false })
	}
	return {
		pool,
		database,
		parameters,
		operations,
		referenceReads,
		get requestCount() {
			return requestCount
		},
		get sql() {
			return sql
		}
	}
}

describe('runFinishedGoodsEpcStep', () => {
	it('filters Mongo MO values and joins them into every scan source before ranking', async () => {
		const fake = harness([], undefined, undefined, undefined, [
			{ mo_no: '13MO-1' },
			{ mo_no: '14MO-1' },
			{ mo_no: '15MO-1' },
			{ mo_no: 'A4MO-1' },
			{ mo_no: 14001 }
		])

		await runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
			inboundDeviceSn: 'INBOUND-DEVICE',
			outboundDeviceSn: 'OUTBOUND-DEVICE',
			includeBackups: true
		})

		expect(fake.parameters.moNos).toBe(JSON.stringify(['14MO-1', '15MO-1']))
		expect(fake.sql.match(/INNER JOIN eligible_mos AS/g)).toHaveLength(4)
		const inboundHistory = fake.sql.slice(
			fake.sql.indexOf('epcs_at_101_history AS ('),
			fake.sql.indexOf('epcs_at_101_ranked AS')
		)
		const outboundHistory = fake.sql.slice(
			fake.sql.indexOf('epcs_at_103_history AS ('),
			fake.sql.indexOf('epcs_at_103_ranked AS')
		)
		const inboundSources = inboundHistory.split(/\bUNION(?:\s+ALL)?\b/i)
		const outboundSources = outboundHistory.split(/\bUNION(?:\s+ALL)?\b/i)
		expect(inboundSources).toHaveLength(2)
		expect(outboundSources).toHaveLength(2)
		for (const source of [...inboundSources, ...outboundSources]) {
			expect(source).toMatch(/INNER JOIN eligible_mos AS/)
		}
		expect(fake.sql.match(/ON m\.mo_no = a\.mo_no/g)).toHaveLength(4)
		const inboundRanking = fake.sql.indexOf('epcs_at_101_ranked AS')
		const outboundRanking = fake.sql.indexOf('epcs_at_103_ranked AS')
		expect(fake.sql.slice(0, inboundRanking).match(/INNER JOIN eligible_mos AS/g)).toHaveLength(2)
		expect(fake.sql.slice(inboundRanking, outboundRanking).match(/INNER JOIN eligible_mos AS/g)).toHaveLength(2)
		expect(fake.sql.slice(outboundRanking)).not.toMatch(/INNER JOIN eligible_mos AS/)
		expect(fake.sql).not.toContain('dv_rfidmatchmst_cust')
		expect(fake.sql).toContain('OPENJSON(@moNos)')
	})

	it('skips MSSQL and reports zero metrics when Mongo has no eligible MOs', async () => {
		const fake = harness([], undefined, undefined, undefined, [{ mo_no: '13MO-1' }, { mo_no: 'ABMO-1' }])
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		try {
			await expect(
				runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
					inboundDeviceSn: 'INBOUND-DEVICE',
					outboundDeviceSn: 'OUTBOUND-DEVICE'
				})
			).resolves.toEqual({ epcs: 0 })

			expect(fake.requestCount).toBe(0)
			expect(info).toHaveBeenCalledWith(
				'Finished goods EPC sync metrics',
				expect.objectContaining({ epcs: 0, batches: 0, epcsPerSecond: 0, mongoBulkWriteMs: 0 })
			)
			expect(Number.isFinite((info.mock.calls[0][1] as Record<string, number>).elapsedMs)).toBe(true)
		} finally {
			info.mockRestore()
		}
	})

	it('propagates manufacturing-order Mongo read errors without success metrics', async () => {
		const error = new Error('MO read failed')
		const fake = harness([], undefined, undefined, undefined, [], error)
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		try {
			await expect(
				runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
					inboundDeviceSn: 'INBOUND-DEVICE',
					outboundDeviceSn: 'OUTBOUND-DEVICE'
				})
			).rejects.toBe(error)
			expect(fake.requestCount).toBe(0)
			expect(info).not.toHaveBeenCalled()
		} finally {
			info.mockRestore()
		}
	})

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
			outboundDeviceSn: 'OUTBOUND-DEVICE',
			moNos: JSON.stringify(['15MO-1'])
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

	it('reports elapsed, batch, throughput, and Mongo write metrics after successful synchronization', async () => {
		const rows = Array.from({ length: 1001 }, (_, index) => ({ ...inbound, epc: `epc-${index}` }))
		const fake = harness(rows)
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		try {
			await expect(
				runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
					inboundDeviceSn: 'INBOUND-DEVICE',
					outboundDeviceSn: 'OUTBOUND-DEVICE'
				})
			).resolves.toEqual({ epcs: 1001 })

			expect(info).toHaveBeenCalledTimes(1)
			expect(info).toHaveBeenCalledWith(
				'Finished goods EPC sync metrics',
				expect.objectContaining({ epcs: 1001, batches: 2 })
			)
			const metrics = info.mock.calls[0][1] as Record<string, unknown>
			for (const field of ['elapsedMs', 'epcsPerSecond', 'mongoBulkWriteMs']) {
				expect(typeof metrics[field]).toBe('number')
				expect(Number.isFinite(metrics[field])).toBe(true)
				expect(metrics[field]).toBeGreaterThanOrEqual(0)
			}
			expect(metrics.epcsPerSecond).toBeGreaterThan(0)
		} finally {
			info.mockRestore()
		}
	})

	it('reports zero throughput when the source has no EPC rows', async () => {
		const fake = harness([])
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		try {
			await expect(
				runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
					inboundDeviceSn: 'INBOUND-DEVICE',
					outboundDeviceSn: 'OUTBOUND-DEVICE'
				})
			).resolves.toEqual({ epcs: 0 })

			expect(info).toHaveBeenCalledWith(
				'Finished goods EPC sync metrics',
				expect.objectContaining({ epcs: 0, batches: 0, epcsPerSecond: 0, mongoBulkWriteMs: 0 })
			)
		} finally {
			info.mockRestore()
		}
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
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})

		try {
			await expect(
				runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
					inboundDeviceSn: 'INBOUND-DEVICE',
					outboundDeviceSn: 'OUTBOUND-DEVICE'
				})
			).rejects.toBe(error)
			expect(info).not.toHaveBeenCalled()
		} finally {
			info.mockRestore()
		}
	})

	it('propagates MSSQL stream errors', async () => {
		const error = new Error('stream failed')
		const fake = harness([], undefined, error)
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})

		try {
			await expect(
				runFinishedGoodsEpcStep(fake.pool, fake.database as never, {
					inboundDeviceSn: 'INBOUND-DEVICE',
					outboundDeviceSn: 'OUTBOUND-DEVICE'
				})
			).rejects.toBe(error)
			expect(info).not.toHaveBeenCalled()
		} finally {
			info.mockRestore()
		}
	})
})
