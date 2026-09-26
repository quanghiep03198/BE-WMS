import { isEmpty, isNil } from 'lodash'
import { z } from 'zod'
import { DefectiveCategory, DefectiveGoodsSource, DefectiveLocation } from '../constants'

export const baseDefectiveGoodsDTO = z.object({
	ri_type: z.enum(['uhf', 'usb', 'manually']),
	defective_category: z.enum(DefectiveCategory),
	po: z.any().nullish().default('PRELOAD'),
	mo_no: z.any().nullish(),
	brand_name: z.string().trim().nonempty(),
	cust_shoes_style: z.string().trim().nonempty(),
	factory_shoes_style: z.string().trim().nonempty(),
	color_sn: z.string().trim().nonempty(),
	size_code: z.string().nonempty().optional(),
	defective_location: z.enum(DefectiveLocation),
	defective_description: z.string().nonempty(),
	shoe_source: z.enum(DefectiveGoodsSource).optional(),
	sewing_line: z
		.string()
		.trim()
		.nullish()
		.transform((value) => (isEmpty(value) ? null : value)),
	assembly_line: z
		.string()
		.trim()
		.nullish()
		.transform((value) => (isEmpty(value) ? null : value))
})

export const createDefectiveGoodsDTO = baseDefectiveGoodsDTO
	.extend({
		epc: z.array(z.string().trim().nonempty().optional()).optional().or(z.string().trim().nonempty().optional()),
		sizes: z
			.array(
				z.object({
					size_code: z.string().nonempty(),
					qty: z.number().min(1)
				})
			)
			.nullish()
	})
	.required({
		brand_name: true,
		cust_shoes_style: true,
		factory_shoes_style: true,
		color_sn: true,
		defective_location: true,
		defective_description: true,
		ri_type: true,
		defective_category: true
	})
	.refine(
		(value) => {
			if (value.defective_category === DefectiveCategory.B_GRADE) return !!value.mo_no
			return true
		},
		{ message: 'Purchase order and Manufacturing order. are required for B Grade category' }
	)
	.check(({ issues, value }) => {
		switch (value.ri_type) {
			case 'uhf': {
				if (!Array.isArray(value.epc) || value.epc.length === 0)
					issues.push({
						code: 'custom',
						input: value,
						message: 'EPCs are required when combination strategy is UHF',
						fatal: true
					})
				if (isNil(value.size_code) || isEmpty(value.size_code.trim()))
					issues.push({
						code: 'custom',
						input: value,
						message: 'ns_validation:required',
						fatal: true
					})

				break
			}
			case 'usb': {
				if (typeof value.epc !== 'string' || value.epc.trim() === '')
					issues.push({
						code: 'custom',
						input: value,
						message: 'EPCs are required when combination strategy is USB',
						fatal: true
					})
				if (isNil(value.size_code) || isEmpty(value.size_code.trim()))
					issues.push({
						code: 'custom',
						input: value,
						message: 'ns_validation:required',
						fatal: true
					})

				break
			}
			case 'manually': {
				if (!Array.isArray(value.sizes))
					issues.push({
						code: 'custom',
						input: value,
						message: 'Sizes are required when combination strategy is manually',
						fatal: true
					})
				break
			}
			default:
				break
		}
	})
	.check(({ issues, value }) => {
		if (Array.isArray(value.sizes) && value.ri_type === 'manually')
			value.sizes.forEach((item, index) => {
				if (value.sizes.findIndex((otherItem) => otherItem.size_code === item.size_code) !== index)
					issues.push({
						code: 'custom',
						input: value,
						message: 'Do not select the same Size',
						fatal: true,
						path: [`sizes.${index}.size_code`]
					})
			})
	})

export const updateDefectiveGoodsDTO = baseDefectiveGoodsDTO
	.extend({
		epc: z.string().trim().nonempty()
	})
	.partial()
	.refine(
		(value) => {
			if (value.defective_category === DefectiveCategory.B_GRADE)
				return typeof value.mo_no === 'string' && !isEmpty(value.mo_no)
			return true
		},
		{ message: 'Purchase order and Manufacturing order. are required for B Grade category' }
	)

export const deleteManyDefectiveGoodsDTO = z.object({
	including_ids: z.literal('all').or(z.array(z.number().int().positive()).nonempty()),
	excluding_ids: z.array(z.number().int().positive()).optional(),
	category: z.enum(DefectiveCategory).optional(),
	po: z.string().optional(),
	mo_no: z.string().optional(),
	brand_name: z.string().optional(),
	cust_shoes_style: z.string().optional(),
	factory_shoes_style: z.string().optional(),
	color_sn: z.string().optional(),
	size_code: z.string().optional(),
	defective_location: z.enum(DefectiveLocation).optional(),
	defect_description: z.string().optional(),
	created: z.string().optional()
})

export type CreateDefectiveGoodsDTO = z.infer<typeof createDefectiveGoodsDTO>
export type UpdateDefectiveGoodsDTO = z.infer<typeof updateDefectiveGoodsDTO>
export type DeleteManyDefectiveGoodsDTO = z.infer<typeof deleteManyDefectiveGoodsDTO>
