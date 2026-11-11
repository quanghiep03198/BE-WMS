import { Workbook } from 'exceljs'
import type { WriteStream } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { ExportStorageService } from '../manifest/export-storage.service'
import { ManifestExportWriter } from '../manifest/manifest-export-writer'
import type { ManifestRow } from '../manifest/manifest.repository'

describe('manifest export writer', () => {
	it('writes separate sheets by customer style and escapes formula-like strings', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'manifest-writer-test-'))
		try {
			const storage = new ExportStorageService({
				get: (name: string, fallback: unknown) => (name === 'EXPORT_DIR' ? dir : fallback)
			} as never)
			await storage.onModuleInit()
			const id = 'a92a1287-c4bf-4c7f-9f7d-e23458774f7b'
			const writer = new ManifestExportWriter(storage.getWriteStream(id), {
				headers: ['Đơn hàng'],
				summary: 'Tổng cộng'
			})
			const row = {
				po: '=unsafe',
				cust_shoes_style: 'Style/One',
				cursor_id: 1
			} as ManifestRow
			await writer.write([row, { ...row, cursor_id: 2, cust_shoes_style: 'Style:Two' }])
			await writer.finish()
			await storage.finalize(id)
			const workbook = new Workbook()
			await workbook.xlsx.load((await readFile(join(dir, `${id}.xlsx`))) as any)
			expect(workbook.worksheets).toHaveLength(2)
			expect(workbook.worksheets[0].getRow(1).getCell(1).value).toBe('Đơn hàng')
			expect(workbook.worksheets[0].name).not.toContain('/')
			expect(workbook.worksheets[0].getRow(2).getCell(1).value).toBe("'=unsafe")
			expect(workbook.worksheets[0].getRow(3).getCell(1).value).toBe('Tổng cộng')
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('splits a large customer style without dropping rows', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'manifest-writer-limit-test-'))
		try {
			const storage = new ExportStorageService({
				get: (name: string, fallback: unknown) => (name === 'EXPORT_DIR' ? dir : fallback)
			} as never)
			await storage.onModuleInit()
			const id = 'a92a1287-c4bf-4c7f-9f7d-e23458774f7b'
			const writer = new ManifestExportWriter(storage.getWriteStream(id))
			const row = { po: 'A', cust_shoes_style: 'Style', cursor_id: 1 } as ManifestRow
			await writer.write(
				Array.from({ length: 5001 }, (_, index) => ({ ...row, cursor_id: index + 1, po: `P${index}` }))
			)
			await writer.finish()
			await storage.finalize(id)
			const workbook = new Workbook()
			await workbook.xlsx.load((await readFile(join(dir, `${id}.xlsx`))) as any)
			expect(workbook.worksheets).toHaveLength(2)
			expect(workbook.worksheets[0].rowCount).toBe(5002)
			expect(workbook.worksheets[1].rowCount).toBe(3)
			expect(workbook.worksheets[1].getRow(2).getCell(1).value).toBe('P5000')
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	}, 30000)

	it('creates valid distinct sheet names for reserved and long Unicode styles', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'manifest-writer-names-test-'))
		try {
			const storage = new ExportStorageService({
				get: (name: string, fallback: unknown) => (name === 'EXPORT_DIR' ? dir : fallback)
			} as never)
			await storage.onModuleInit()
			const id = 'a92a1287-c4bf-4c7f-9f7d-e23458774f7b'
			const writer = new ManifestExportWriter(storage.getWriteStream(id))
			const row = { po: 'A', cust_shoes_style: 'History', cursor_id: 1 } as ManifestRow
			await writer.write([row, { ...row, cust_shoes_style: '😀'.repeat(20), cursor_id: 2 }])
			await writer.finish()
			await storage.finalize(id)
			const workbook = new Workbook()
			await workbook.xlsx.load((await readFile(join(dir, `${id}.xlsx`))) as any)
			expect(workbook.worksheets).toHaveLength(2)
			expect(workbook.worksheets[0].name).not.toBe('History')
			expect(workbook.worksheets[1].name).not.toContain('�')
			expect(workbook.worksheets[1].name.length).toBeLessThanOrEqual(31)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it('propagates an output stream failure', async () => {
		const sink = new Writable({
			write(_chunk, _encoding, callback) {
				callback(new Error('disk unavailable'))
			}
		})
		const writer = new ManifestExportWriter(sink as WriteStream)
		const row = { po: 'A', cust_shoes_style: 'Style', cursor_id: 1 } as ManifestRow
		await writer.write([row])
		await expect(writer.finish()).rejects.toThrow('disk unavailable')
		writer.abort()
	})
})
