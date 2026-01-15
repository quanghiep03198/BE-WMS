import { isEmpty, isNil } from 'lodash'
import { z } from 'zod'
import { DefectiveCategory, DefectiveGoodsSource, DefectiveLocation } from '../constants'

export const baseDefectiveGoodsDTO = z.object({
	ri_type: z.enum(['uhf', 'usb', 'manually']),
	defective_category: z.nativeEnum(DefectiveCategory),
	po: z.any().nullish().default('PRELOAD'),
	mo_no: z.any().nullish(),
	brand_name: z.string().trim().nonempty(),
	cust_shoes_style: z.string().trim().nonempty(),
	factory_shoes_style: z.string().trim().nonempty(),
	color_sn: z.string().trim().nonempty(),
	size_code: z.string().nonempty().optional(),
	defective_location: z.nativeEnum(DefectiveLocation),
	defective_description: z.string().nonempty(),
	shoe_source: z.nativeEnum(DefectiveGoodsSource).optional(),
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
			.optional()
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
		(values) => {
			if (values.defective_category === DefectiveCategory.B_GRADE) return !!values.mo_no
			return true
		},
		{ message: 'Purchase order and Manufacturing order. are required for B Grade category' }
	)
	.superRefine((values, context) => {
		switch (values.ri_type) {
			case 'uhf': {
				if (!Array.isArray(values.epc) || values.epc.length === 0)
					context.addIssue({
						code: 'custom',
						message: 'EPCs are required when combination strategy is UHF',
						fatal: true
					})
				if (isNil(values.size_code) || isEmpty(values.size_code.trim()))
					context.addIssue({
						code: 'custom',
						message: 'ns_validation:required',
						fatal: true
					})

				break
			}
			case 'usb': {
				if (typeof values.epc !== 'string' || values.epc.trim() === '')
					context.addIssue({
						code: 'custom',
						message: 'EPCs are required when combination strategy is USB',
						fatal: true
					})
				if (isNil(values.size_code) || isEmpty(values.size_code.trim()))
					context.addIssue({
						code: 'custom',
						message: 'ns_validation:required',
						fatal: true
					})

				break
			}
			case 'manually': {
				if (!Array.isArray(values.sizes))
					context.addIssue({
						code: 'custom',
						message: 'Sizes are required when combination strategy is manually',
						fatal: true
					})
				break
			}
			default:
				break
		}
	})
	.superRefine((values, context) => {
		values.sizes.forEach((item, index) => {
			if (values.sizes.findIndex((otherItem) => otherItem.size_code === item.size_code) !== index)
				context.addIssue({
					code: 'custom',
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
		(values) => {
			if (values.defective_category === DefectiveCategory.B_GRADE)
				return typeof values.mo_no === 'string' && !isEmpty(values.mo_no)
			return true
		},
		{ message: 'Purchase order and Manufacturing order. are required for B Grade category' }
	)

export const deleteManyDefectiveGoodsDTO = z.object({
	including_ids: z.literal('all').or(z.array(z.number().int().positive()).nonempty()),
	excluding_ids: z.array(z.number().int().positive()).optional(),
	category: z.nativeEnum(DefectiveCategory).optional(),
	po: z.string().optional(),
	mo_no: z.string().optional(),
	brand_name: z.string().optional(),
	cust_shoes_style: z.string().optional(),
	factory_shoes_style: z.string().optional(),
	color_sn: z.string().optional(),
	size_code: z.string().optional(),
	defective_location: z.nativeEnum(DefectiveLocation).optional(),
	defect_description: z.string().optional(),
	created: z.string().optional()
})

export type CreateDefectiveGoodsDTO = z.infer<typeof createDefectiveGoodsDTO>
export type UpdateDefectiveGoodsDTO = z.infer<typeof updateDefectiveGoodsDTO>
export type DeleteManyDefectiveGoodsDTO = z.infer<typeof deleteManyDefectiveGoodsDTO>
