import { Worksheet } from 'exceljs'
import { ExcelColorPalette } from '../constants/excel-color-palette'

export type AutoFitColumnOptions = { minWidth: number; excludeColumns?: string[] }

export function autoFitColumns(this: Worksheet, { minWidth = 10, excludeColumns }: AutoFitColumnOptions) {
	this.columns.forEach((column) => {
		let maxWidth: number = 0
		if (column) {
			column.eachCell({ includeEmpty: true }, (cell) => {
				const cellWidth = cell.text.length
				maxWidth = Math.max(maxWidth, minWidth, cellWidth)
			})
			column.width = Array.isArray(excludeColumns) && excludeColumns.includes(column.key) ? minWidth : maxWidth + 2
		}
	})
}

export function getLastColumnLetter(columnCount: number): string {
	return String.fromCharCode(65 + columnCount - 1)
}

export function applyCommonStyles(this: Worksheet) {
	// * Cell styles
	this.eachRow({ includeEmpty: false }, (row) => {
		row.alignment = { vertical: 'middle', horizontal: 'center' }
		row.eachCell({ includeEmpty: true }, (cell) => {
			cell.font = { ...cell.font, name: 'Calibri', family: 1 }
			cell.border = {
				top: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				left: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				bottom: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				right: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } }
			}
		})
	})
}
