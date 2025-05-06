export type AutoFitColumnOptions = { minWidth: number; excludeColumns?: string[] }

export function autoFitColumns({ minWidth = 10, excludeColumns }: AutoFitColumnOptions) {
	// worksheet.columns.forEach((column, index) => {
	// 	let maxColumnWidth = 0
	// 	const minColumnWidth = 10
	// 	column.alignment = { vertical: 'middle', horizontal: index <= 2 ? 'left' : 'right' }
	// 	if (column) {
	// 		column.eachCell({ includeEmpty: true }, (cell) => {
	// 			const cellWidth = cell.value ? cell.value.toString().length : 0
	// 			maxColumnWidth = Math.max(maxColumnWidth, minColumnWidth, cellWidth)
	// 		})
	// 		column.width = column.key === 'po' ? minColumnWidth : maxColumnWidth + 2
	// 	}
	// })

	this.columns.forEach((column) => {
		let maxWidth: number = 0
		if (column) {
			column.eachCell({ includeEmpty: true }, (cell) => {
				const cellWidth = cell.value ? cell.value.toString().length : 0
				maxWidth = Math.max(maxWidth, minWidth, cellWidth)
			})
			column.width = Array.isArray(excludeColumns) && excludeColumns.includes(column.key) ? minWidth : maxWidth + 2
		}
	})
}
