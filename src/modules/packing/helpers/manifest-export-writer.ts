import { ExcelColorPalette } from '@common/constants/excel-color-palette'
import { stream, Worksheet } from 'exceljs'
import { EventEmitter } from 'node:events'
import type { WriteStream } from 'node:fs'
import type { ManifestRow } from '../repositories/manifest.repository'

const SHEET_ROWS = 5000
const fields = [
	'po',
	'brand_name',
	'factory_shoes_style',
	'cust_shoes_style',
	'color_sn',
	'packing_standard',
	'standard_weight',
	'actual_avg_weight',
	'target_box_qty',
	'target_item_qty',
	'weighed_box_qty',
	'unweighed_box_qty'
] as const

function safeCell(value: string | number | null): string | number | null {
	return typeof value === 'string' && /^[=+\-@]/.test(value) ? `'${value}` : value
}

function sheetPrefix(value: string, limit: number) {
	let result = ''
	for (const character of value) {
		if (result.length + character.length > limit) break
		result += character
	}
	return result.replace(/'+$/g, '') || 'Unknown'
}

export class ManifestExportWriter {
	private readonly workbook: stream.xlsx.WorkbookWriter
	private readonly zip: EventEmitter
	private failure?: Error
	private readonly errorWaiters = new Set<(error: Error) => void>()
	private readonly names = new Set<string>()
	private worksheet?: Worksheet
	private currentStyle?: string
	private sheetRows = 0
	private sheetCount = 0
	private totals = [0, 0, 0, 0]

	constructor(
		private readonly output: WriteStream,
		private readonly labels?: { headers: string[]; summary: string; title?: string }
	) {
		this.workbook = new stream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: false })
		if (!('zip' in this.workbook) || !(this.workbook.zip instanceof EventEmitter)) {
			throw new Error('Unsupported ExcelJS streaming ZIP implementation')
		}
		this.zip = this.workbook.zip
		const onError = (error: Error) => {
			this.failure = error
			for (const waiter of this.errorWaiters) waiter(error)
		}
		output.on('error', onError)
		this.zip.on('error', onError)
	}

	private async waitFor<T>(work: Promise<T>): Promise<T> {
		if (this.failure) throw this.failure
		return new Promise<T>((resolve, reject) => {
			const onError = (error: Error) => {
				this.errorWaiters.delete(onError)
				reject(error)
			}
			this.errorWaiters.add(onError)
			work.then(
				(value) => {
					this.errorWaiters.delete(onError)
					resolve(value)
				},
				(error: Error) => {
					this.errorWaiters.delete(onError)
					reject(error)
				}
			)
		})
	}

	private openSheet(style: string) {
		let base =
			Array.from(style, (character) => (character.charCodeAt(0) < 32 ? ' ' : character))
				.join('')
				.replace(/[*?:/\\[\]]/g, ' ')
				.replace(/^'+|'+$/g, '')
				.trim() || 'Unknown'
		if (base.toLocaleLowerCase('en-US') === 'history') base += '_'
		let name = sheetPrefix(base, 31)
		let suffix = 2
		while (this.names.has(name.toLocaleLowerCase('en-US'))) {
			const ending = ` (${suffix++})`
			name = sheetPrefix(base, 31 - ending.length) + ending
		}
		this.names.add(name.toLocaleLowerCase('en-US'))
		this.sheetCount++
		this.worksheet = this.workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2 }] })
		this.worksheet.columns = fields.map((field) => ({
			key: field,
			width: 24
		}))
		this.worksheet.mergeCells('A1:L1')
		const title = this.worksheet.getRow(1)
		title.getCell(1).value = this.labels?.title ?? 'Packing Manifest'
		title.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
		title.getCell(1).fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
		}
		title.font = { name: 'Calibri', family: 1, size: 14, bold: true }
		title.height = 30
		title.commit()
		const header = this.worksheet.addRow(fields.map((field, index) => this.labels?.headers[index] ?? field))
		header.height = 30
		header.eachCell((cell, column) => {
			cell.font = { name: 'Calibri', family: 1, bold: true }
			cell.alignment = { vertical: 'middle', horizontal: column <= 6 ? 'left' : 'right' }
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ExcelColorPalette.BG_LIGHT_BLUE } }
			cell.border = this.border()
		})
		header.commit()
		this.currentStyle = style
		this.sheetRows = 0
		this.totals = [0, 0, 0, 0]
	}

	private border() {
		const edge = { style: 'thin' as const, color: { argb: ExcelColorPalette.BORDER } }
		return { top: edge, left: edge, bottom: edge, right: edge }
	}

	private async closeSheet() {
		if (!this.worksheet) return
		const sheet = this.worksheet
		const path = `xl/worksheets/sheet${this.sheetCount}.xml`
		const summary = sheet.addRow([
			this.labels?.summary ?? 'Summary',
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			...this.totals.map((result, index) => {
				const column = String.fromCharCode('I'.charCodeAt(0) + index)
				return { formula: this.sheetRows ? `SUM(${column}3:${column}${this.sheetRows + 2})` : '0', result }
			})
		])
		sheet.mergeCells(`A${summary.number}:H${summary.number}`)
		summary.height = 30
		summary.alignment = { vertical: 'middle', horizontal: 'right' }
		summary.eachCell({ includeEmpty: true }, (cell) => {
			cell.font = { name: 'Calibri', family: 1, bold: true }
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW } }
			cell.border = this.border()
		})
		summary.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
		summary.commit()
		// ExcelJS does not expose row backpressure; wait for its ZIP entry before opening the next bounded sheet.
		let onEntry: (entry: { name: string }) => void
		const archived = new Promise<void>((resolve) => {
			onEntry = (entry: { name: string }) => {
				if (entry.name.replace(/^\//, '') !== path) return
				resolve()
			}
			this.zip.on('entry', onEntry)
		})
		try {
			sheet.commit()
			this.worksheet = undefined
			await this.waitFor(archived)
		} finally {
			this.zip.removeListener('entry', onEntry)
		}
	}

	async write(rows: ManifestRow[]) {
		if (this.failure) throw this.failure
		for (const row of rows) {
			if (!this.worksheet || row.cust_shoes_style !== this.currentStyle || this.sheetRows === SHEET_ROWS) {
				await this.closeSheet()
				this.openSheet(row.cust_shoes_style)
			}
			const dataRow = this.worksheet.addRow(fields.map((field) => safeCell(row[field] ?? null)))
			dataRow.eachCell({ includeEmpty: true }, (cell, column) => {
				cell.font = { name: 'Calibri', family: 1 }
				cell.border = this.border()
				if (column > 6) cell.alignment = { vertical: 'middle', horizontal: 'right' }
			})
			dataRow.commit()
			this.totals[0] += row.target_box_qty ?? 0
			this.totals[1] += row.target_item_qty ?? 0
			this.totals[2] += row.weighed_box_qty ?? 0
			this.totals[3] += row.unweighed_box_qty ?? 0
			this.sheetRows++
		}
	}

	async finish() {
		if (!this.worksheet && this.sheetCount === 0) this.openSheet('Empty')
		await this.closeSheet()
		if (this.failure) throw this.failure
		await this.waitFor(this.workbook.commit())
	}

	abort() {
		if ('abort' in this.zip && typeof this.zip.abort === 'function') this.zip.abort()
		this.output.destroy()
	}
}
