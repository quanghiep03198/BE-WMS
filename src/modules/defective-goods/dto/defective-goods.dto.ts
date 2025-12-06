import { isEmpty } from 'lodash'
import { z } from 'zod'
import { DefectiveCategory, DefectiveLocation } from '../constants'

export const baseDefectiveGoodsDTO = z.object({
	defective_category: z.nativeEnum(DefectiveCategory),
	po: z.any().nullable().optional(),
	mo_no: z.any().nullable().optional(),
	brand_name: z.string().trim().nonempty(),
	cust_shoes_style: z.string().trim().nonempty(),
	factory_shoes_style: z.string().trim().nonempty(),
	color_sn: z.string().trim().nonempty(),
	size_code: z.string().nonempty(),
	defective_location: z.nativeEnum(DefectiveLocation),
	defective_description: z.string().nonempty(),
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
		epc: z.array(z.string().trim().nonempty()).or(z.string().trim().nonempty())
	})
	.required()
	.refine(
		(values) => {
			if (values.defective_category === DefectiveCategory.B_GRADE) return !!values.po && !!values.mo_no
			return true
		},
		{ message: 'Purchase order and Manufacturing order. are required for B Grade category' }
	)

export const updateDefectiveGoodsDTO = baseDefectiveGoodsDTO
	.extend({
		epc: z.string().trim().nonempty()
	})
	.partial()
	.refine(
		(values) => {
			if (values.defective_category === DefectiveCategory.B_GRADE)
				return (
					typeof values.po === 'string' &&
					typeof values.mo_no === 'string' &&
					!isEmpty(values.po) &&
					!isEmpty(values.mo_no)
				)
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
