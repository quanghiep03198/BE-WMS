import { stream, Worksheet } from 'exceljs'
import { EventEmitter } from 'node:events'
import type { WriteStream } from 'node:fs'
import type { ManifestRow } from './manifest.repository'

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
		private readonly labels?: { headers: string[]; summary: string }
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
		this.worksheet = this.workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
		this.worksheet.columns = fields.map((field, index) => ({
			header: this.labels?.headers[index] ?? field,
			key: field,
			width: 24
		}))
		this.worksheet.getRow(1).font = { bold: true }
		this.worksheet.getRow(1).commit()
		this.currentStyle = style
		this.sheetRows = 0
		this.totals = [0, 0, 0, 0]
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
			...this.totals
		])
		summary.font = { bold: true }
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
			this.worksheet.addRow(fields.map((field) => safeCell(row[field] ?? null))).commit()
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
