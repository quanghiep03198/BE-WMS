import { z } from 'zod'
import { MANIFEST_FIELDS } from './manifest-filter'

const numeric = z
	.union([z.number(), z.string().trim().min(1)])
	.transform((value) => Number(value))
	.pipe(z.number().finite())
const text = z.string().optional()
const range = numeric.optional()
export const MANIFEST_PAGE_SIZE = 20

const filterFields = {
	po: text,
	brand_name: text,
	factory_shoes_style: text,
	cust_shoes_style: text,
	color_sn: text,
	packing_standard: text,
	factory_code_produce: text,
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
export const manifestListValidator = z.strictObject({
	...filterFields,
	page: numeric.pipe(z.number().int().min(1).max(2147483647)).default(1),
	pageSize: numeric
		.pipe(z.number().int().min(1).max(100))
		.default(MANIFEST_PAGE_SIZE)
		.transform(() => MANIFEST_PAGE_SIZE)
})

export type ManifestFilterDto = z.infer<typeof manifestFilterValidator>
export type ManifestListDto = z.infer<typeof manifestListValidator>
