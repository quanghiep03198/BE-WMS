import type { ManifestFilterDto } from '../dto/manifest-filter.dto'

const STRING_FIELDS = [
	'po',
	'brand_name',
	'factory_shoes_style',
	'cust_shoes_style',
	'color_sn',
	'packing_standard',
	'factory_code_produce'
] as const

const NUMBER_FIELDS = [
	'standard_weight',
	'actual_avg_weight',
	'target_box_qty',
	'target_item_qty',
	'weighed_box_qty',
	'unweighed_box_qty'
] as const

export const MANIFEST_FIELDS = [...STRING_FIELDS, ...NUMBER_FIELDS]
const SORT_COLUMNS = new Map<string, string>(MANIFEST_FIELDS.map((field) => [field, `[${field}]`]))

export function manifestSortColumn(field: string): string {
	const column = SORT_COLUMNS.get(field)
	if (!column) throw new Error('Invalid manifest sort field')
	return column
}

export function buildManifestFilter(filter: ManifestFilterDto, startIndex: number) {
	const clauses: string[] = []
	const parameters: Array<string | number> = []
	const add = (column: string, operator: string, value: string | number, suffix = '') => {
		clauses.push(`${manifestSortColumn(column)} ${operator} @${startIndex + parameters.length}${suffix}`)
		parameters.push(value)
	}

	for (const field of STRING_FIELDS) {
		const value = filter[field]
		if (value !== undefined && value !== null) {
			add(field, 'LIKE', `%${value.replace(/[~%_\[]/g, '~$&')}%`, " ESCAPE '~'")
		}
		const exact = filter[`${field}Eq`]
		if (exact !== undefined) add(field, '=', exact)
	}
	for (const field of NUMBER_FIELDS) {
		const exact = filter[`${field}Eq`]
		const from = filter[`${field}From`]
		const to = filter[`${field}To`]
		if (exact !== undefined) add(field, '=', exact)
		if (from !== undefined && from !== null) add(field, '>=', from)
		if (to !== undefined && to !== null) add(field, '<=', to)
	}
	if (filter.q !== undefined) {
		const index = startIndex + parameters.length
		const search = STRING_FIELDS.map((field) => `${manifestSortColumn(field)} LIKE @${index} ESCAPE '~'`).join(' OR ')
		clauses.push(`(${search})`)
		parameters.push(`%${filter.q.replace(/[~%_\[]/g, '~$&')}%`)
	}
	return { sql: clauses.length ? clauses.join(' AND ') : '1 = 1', parameters }
}
