import { Readable } from 'node:stream'
import { runFinishedGoodsEpcStep } from './finished-goods-epcs'

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
	storage_location: 'A01',
	assembly_line: 'VB2-BA 01',
	inbound_times: 1,
	status: 'instock',
	rfid_status: 'A'
}

function harness(rows: unknown[], writeError?: Error, streamError?: Error) {
	const parameters: Record<string, string> = {}
	let sql = ''
	const operations: unknown[] = []
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
							storage_location: inbound.storage_location,
							assembly_line: 'VB2BA01',
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
