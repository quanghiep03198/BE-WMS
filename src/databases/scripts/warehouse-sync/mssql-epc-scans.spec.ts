import { Readable } from 'node:stream'
import { readMssqlEpcScans } from './mssql-epc-scans'

const cutoff = new Date('2026-11-11T17:00:00Z')

function scan(record_time: string, mo_no = '14ABC') {
	return {
		epc: '303400000000000000000001',
		mo_no,
		record_time,
		station_no: 'CUS_VB2_WH101',
		station_suffix: '101',
		rfid_status: 'A',
		po: null,
		storage: 'A01',
		dept_code: 'VB2BA01'
	}
}

describe('readMssqlEpcScans', () => {
	it('requests selected MOs before midnight Vietnam time and retains the last scan of yesterday', async () => {
		const parameters: Record<string, string> = {}
		let query = ''
		const request = {
			input: (name: string, value: string) => {
				parameters[name] = value
			},
			toReadableStream: () => Readable.from([scan('2026-11-11T23:59:59.999')]),
			query: async (sql: string) => {
				query = sql
			},
			cancel: () => true
		}
		const rows = []
		for await (const row of readMssqlEpcScans(request, ['14ABC'], cutoff)) rows.push(row)
		expect(parameters).toEqual({ mo0: '14ABC', cutoff: '2026-11-12T00:00:00' })
		expect(query.match(/record_time\s*<\s*@cutoff/g)).toHaveLength(2)
		expect(rows).toEqual([{ ...scan('2026-11-11T23:59:59.999'), record_time: new Date('2026-11-11T16:59:59.999Z') }])
	})

	it('rejects the first instant of the current Vietnam day', async () => {
		const request = {
			input: () => undefined,
			toReadableStream: () => Readable.from([scan('2026-11-12T00:00:00.000')]),
			query: async () => undefined,
			cancel: () => true
		}
		await expect(async () => {
			for await (const row of readMssqlEpcScans(request, ['14ABC'], cutoff)) throw new Error(`Unexpected ${row.epc}`)
		}).rejects.toThrow('Invalid EPC scan record_time')
	})

	it('rejects a cutoff other than midnight Vietnam time', async () => {
		const request = {
			input: () => undefined,
			toReadableStream: () => Readable.from([]),
			query: async () => undefined,
			cancel: () => true
		}
		await expect(async () => {
			for await (const row of readMssqlEpcScans(request, ['14ABC'], new Date('2026-11-12T06:50:00Z')))
				throw new Error(`Unexpected ${row.epc}`)
		}).rejects.toThrow('Cutoff must be midnight in Vietnam')
	})

	it('rejects source rows for an MO outside the selected batch', async () => {
		const request = {
			input: () => undefined,
			toReadableStream: () => Readable.from([scan('2026-11-11T23:00:00.000', 'OTHER')]),
			query: async () => undefined,
			cancel: () => true
		}
		await expect(async () => {
			for await (const row of readMssqlEpcScans(request, ['14ABC'], cutoff)) throw new Error(`Unexpected ${row.epc}`)
		}).rejects.toThrow('Unexpected EPC scan MO')
	})
})
