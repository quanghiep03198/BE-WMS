import { z } from 'zod'
import { MANIFEST_FIELDS } from '../helpers/manifest-filter'

const numeric = z
	.union([z.number(), z.string().trim().min(1)])
	.transform((value) => Number(value))
	.pipe(z.number().finite())
const text = z.string().optional()
const range = numeric.optional()
export const MANIFEST_PAGE_SIZE = 20

const filterFields = {
	q: text,
	po: text,
	poEq: text,
	brand_name: text,
	brand_nameEq: text,
	factory_shoes_style: text,
	factory_shoes_styleEq: text,
	cust_shoes_style: text,
	cust_shoes_styleEq: text,
	color_sn: text,
	color_snEq: text,
	packing_standard: text,
	packing_standardEq: text,
	factory_code_produce: text,
	factory_code_produceEq: text,
	standard_weightEq: range,
	actual_avg_weightEq: range,
	target_box_qtyEq: range,
	target_item_qtyEq: range,
	weighed_box_qtyEq: range,
	unweighed_box_qtyEq: range,
	standard_weightFrom: range,
	standard_weightTo: range,
	actual_avg_weightFrom: range,
	actual_avg_weightTo: range,
	target_box_qtyFrom: range,
	target_box_qtyTo: range,
	target_item_qtyFrom: range,
	target_item_qtyTo: range,
	weighed_box_qtyFrom: range,
	weighed_box_qtyTo: range,
	unweighed_box_qtyFrom: range,
	unweighed_box_qtyTo: range,
	sortBy: z.enum(MANIFEST_FIELDS).optional(),
	sortOrder: z.enum(['ASC', 'DESC']).optional()
}

export const manifestFilterValidator = z.strictObject(filterFields)
const internalManifestListValidator = z.strictObject({
	...filterFields,
	page: numeric.pipe(z.number().int().min(1).max(2147483647)).default(1),
	pageSize: numeric.pipe(z.number().int().min(1).max(100)).default(MANIFEST_PAGE_SIZE)
})

export const manifestListValidator = z.preprocess((value) => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value
	const mapped: Record<string, unknown> = {}
	for (const [key, input] of Object.entries(value)) {
		const aliases: Record<string, string> = {
			_page: 'page',
			_limit: 'pageSize',
			_sort: 'sortBy',
			_order: 'sortOrder'
		}
		const match = key.match(/^(.+):(eq|contains|gte|lte)$/)
		const target =
			aliases[key] ??
			(match
				? `${match[1]}${match[2] === 'gte' ? 'From' : match[2] === 'lte' ? 'To' : match[2] === 'eq' ? 'Eq' : ''}`
				: key)
		if (Object.prototype.hasOwnProperty.call(mapped, target)) return value
		mapped[target] = key === '_order' && typeof input === 'string' ? input.toUpperCase() : input
	}
	return mapped
}, internalManifestListValidator)

export type ManifestFilterDto = z.infer<typeof manifestFilterValidator>
export type ManifestListDto = z.infer<typeof manifestListValidator>
