import { Workbook as ExcelWorkbook, Worksheet } from 'exceljs'

export default class Workbook extends ExcelWorkbook {
	constructor() {
		super()
	}

	/**
	 * Automatically adjust the width of columns in the worksheet.
	 * @param {Worksheet} worksheet
	 * @param {number }minWidth
	 * @param {string[]} excludeKeys
	 * @returns
	 */
	private autoFitColumns(name: string, minWidth: number = 10, excludeKeys?: string[]) {
		let maxWidth: number = 0
		const worksheet = this.getWorksheet(name)
		if (!worksheet) return
		worksheet.columns.forEach((column) => {
			if (column) {
				column.eachCell({ includeEmpty: true }, (cell) => {
					const cellWidth = cell.value ? cell.value.toString().length : 0
					maxWidth = Math.max(maxWidth, minWidth, cellWidth)
				})
				column.width = Array.isArray(excludeKeys) && excludeKeys.includes(column.key) ? minWidth : maxWidth + 2
			}
		})
	}

	/**
	 * @override
	 * @param {string} name
	 * @returns {Worksheet}
	 */
	public override addWorksheet(name: string) {
		const worksheet = super.addWorksheet(name)
		Object.defineProperty(worksheet, 'autoFitColumns', {
			value: (minWidth: number = 10, excludeKeys?: string[]) => this.autoFitColumns(name, minWidth, excludeKeys)
		})
		console.log(worksheet)
		// this.autoFitColumns.bind(worksheet)
		return worksheet
	}
}
