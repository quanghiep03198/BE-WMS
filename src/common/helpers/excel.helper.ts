import { Worksheet } from 'exceljs'
import { ExcelColorPalette } from '../constants/excel-color-palette'

export type AutoFitColumnOptions = { minWidth: number; excludeColumns?: string[] }

export function autoFitColumns(this: Worksheet, { minWidth = 6, excludeColumns }: AutoFitColumnOptions) {
	this.columns.forEach((column) => {
		if (!column) return

		if (Array.isArray(excludeColumns) && excludeColumns.includes(column.key)) {
			column.width = minWidth
			return
		}

		let maxWidth: number = minWidth
		column.eachCell({ includeEmpty: true }, (cell) => {
			const lines = cell.text.split(/\n/)
			const longestLineWidth = Math.max(
				...lines.map((line) => {
					// Uppercase letters are wider than lowercase in proportional fonts (Calibri)
					let width = 0
					for (const char of line) {
						if (char >= 'A' && char <= 'Z') width += 1.2
						else if (char >= 'a' && char <= 'z') width += 1
						else if (char >= '0' && char <= '9') width += 1.1
						else width += 1
					}
					return width
				})
			)
			const cellWidth = cell.font?.bold ? longestLineWidth * 1.2 : longestLineWidth
			maxWidth = Math.max(maxWidth, cellWidth)
		})
		column.width = maxWidth + 2
	})
}

export function getLastColumnLetter(columnCount: number): string {
	let result = ''
	let n = columnCount
	while (n > 0) {
		n--
		result = String.fromCharCode(65 + (n % 26)) + result
		n = Math.floor(n / 26)
	}
	return result
}

export function applyCommonStyles(this: Worksheet) {
	// * Cell styles

	this.eachRow({ includeEmpty: false }, (row) => {
		row.alignment = { vertical: 'middle' }
		row.eachCell({ includeEmpty: true }, (cell) => {
			cell.font = { ...cell.font, name: 'Calibri', family: 1 }
			cell.alignment = { vertical: 'middle', horizontal: 'center' }
			cell.border = {
				top: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				left: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				bottom: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				right: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } }
			}
		})
	})
}
