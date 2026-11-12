import { Workbook } from 'exceljs'
import type { WriteStream } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { ManifestExportWriter } from '../helpers/manifest-export-writer'
import type { ManifestRow } from '../repositories/manifest.repository'
import { ExportStorageService } from '../services/export-storage.service'

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
				summary: 'Tổng cộng',
				title: 'Báo cáo'
			})
			const row = {
				po: '=unsafe',
				cust_shoes_style: 'Style/One',
				target_box_qty: 4,
				target_item_qty: 12,
				weighed_box_qty: 3,
				unweighed_box_qty: 1,
				cursor_id: 1
			} as ManifestRow
			await writer.write([row, { ...row, cursor_id: 2, cust_shoes_style: 'Style:Two' }])
			await writer.finish()
			await storage.finalize(id)
			const workbook = new Workbook()
			await workbook.xlsx.load((await readFile(join(dir, `${id}.xlsx`))) as any)
			expect(workbook.worksheets).toHaveLength(2)
			const sheet = workbook.worksheets[0]
			expect(sheet.getCell('A1').value).toBe('Báo cáo')
			expect(sheet.getCell('A2').value).toBe('Đơn hàng')
			expect(sheet.getRow(1).height).toBe(30)
			expect(sheet.getRow(2).height).toBe(30)
			expect(sheet.getCell('A1').font).toMatchObject({ bold: true, size: 14 })
			expect(sheet.getCell('A2').fill).toMatchObject({ fgColor: { argb: 'deecf7' } })
			expect(sheet.getCell('A3').font.name).toBe('Calibri')
			expect(sheet.getCell('A3').border.top).toMatchObject({ style: 'thin', color: { argb: 'a1a1a1' } })
			expect(sheet.getRow(4).height).toBe(30)
			expect(sheet.getCell('A4').fill).toMatchObject({ fgColor: { argb: 'fff2cc' } })
			expect(sheet.getCell('I4').value).toEqual({ formula: 'SUM(I3:I3)', result: 4 })
			expect(sheet.getCell('J4').value).toEqual({ formula: 'SUM(J3:J3)', result: 12 })
			expect(sheet.getCell('K4').value).toEqual({ formula: 'SUM(K3:K3)', result: 3 })
			expect(sheet.getCell('L4').value).toEqual({ formula: 'SUM(L3:L3)', result: 1 })
			expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 2 })
			expect(workbook.worksheets[0].name).not.toContain('/')
			expect(sheet.getRow(3).getCell(1).value).toBe("'=unsafe")
			expect(sheet.getRow(4).getCell(1).value).toBe('Tổng cộng')
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
			expect(workbook.worksheets[0].rowCount).toBe(5003)
			expect(workbook.worksheets[1].rowCount).toBe(4)
			expect(workbook.worksheets[1].getRow(3).getCell(1).value).toBe('P5000')
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
