import { Worksheet } from 'exceljs'

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
