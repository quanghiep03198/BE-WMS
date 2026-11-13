import { Readable } from 'node:stream'
import { readMssqlOutboundScans } from './mssql-outbound-scans'

describe('readMssqlOutboundScans', () => {
	it('skips scans with null or blank POs while retaining valid scans', async () => {
		const base = { mo_no: '14001', size: '08', date: '2026-11-10', time: '10:24', quantity: -2 }
		const rows = [{ ...base, po: null }, { ...base, po: '' }, { ...base, po: '  ' }, { ...base, po: ' PO1 ' }]
		const request = {
			input: () => undefined,
			toReadableStream: () => Readable.from(rows),
			query: async () => undefined,
			cancel: () => true
		}
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			const result = []
			for await (const row of readMssqlOutboundScans(request, 'GL3', new Date('2026-11-11T17:00:00Z'))) {
				result.push(row)
			}
			expect(result).toEqual([{ ...base, po: 'PO1', quantity: 2 }])
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('3'))
		} finally {
			warn.mockRestore()
		}
	})

	it('rejects non-string, non-null PO values', async () => {
		const request = {
			input: () => undefined,
			toReadableStream: () => Readable.from([{ po: 42, mo_no: '14001', size: '08', date: '2026-11-10', time: '10:24', quantity: -1 }]),
			query: async () => undefined,
			cancel: () => true
		}
		await expect(async () => {
			for await (const _row of readMssqlOutboundScans(request, 'GL3', new Date('2026-11-11T17:00:00Z'))) {}
		}).rejects.toThrow('Invalid outbound scan po')
	})

	it('streams rows from the supplied tenant and converts outbound quantities', async () => {
		const parameters = new Map<string, unknown>()
		let sql = ''
		const cutoff = new Date('2026-11-11T17:00:00Z')
		const rows = [{ po: 'PO1', mo_no: '14001', size: '08', date: '2026-11-10', time: '10:24', quantity: -2 }]
		const request = {
			input: (name: string, value: string) => {
				parameters.set(name, value)
			},
			toReadableStream: () => Readable.from(rows),
			query: async (value: string) => {
				sql = value
			},
			cancel: () => true
		}
		const result = []
		for await (const row of readMssqlOutboundScans(request, 'GL3', cutoff)) result.push(row)
		expect(parameters.get('tenant')).toBe('GL3')
		expect(parameters.get('cutoff')).toBe('2026-11-12')
		expect(sql.match(/record_time\s*<\s*@cutoff/g)).toHaveLength(2)
		expect(result).toEqual([
			{ po: 'PO1', mo_no: '14001', size: '08', date: '2026-11-10', time: '10:24', quantity: 2 }
		])
	})

	it('propagates SQL errors instead of treating a partial stream as success', async () => {
		const request = {
			input: () => undefined,
			toReadableStream: () => new Readable({ objectMode: true, read() {} }),
			query: async () => {
				throw new Error('SQL failed')
			},
			cancel: () => true
		}
		await expect(async () => {
			for await (const row of readMssqlOutboundScans(request, 'GL3', new Date('2026-11-11T17:00:00Z'))) {
				throw new Error(`Unexpected row: ${row.po}`)
			}
		}).rejects.toThrow('SQL failed')
	})

	it('treats a rejection without an error value as a failure', async () => {
		const request = {
			input: () => undefined,
			toReadableStream: () => Readable.from([]),
			query: async () =>
				new Promise((_resolve, reject) => {
					setTimeout(() => reject(undefined), 10)
				}),
			cancel: () => true
		}
		await expect(async () => {
			for await (const row of readMssqlOutboundScans(request, 'GL3', new Date('2026-11-11T17:00:00Z'))) {
				throw new Error(`Unexpected row: ${row.po}`)
			}
		}).rejects.toThrow('undefined')
	})
})
