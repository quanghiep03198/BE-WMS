import { isEmpty } from 'lodash'
import { z } from 'zod'
import { DefectiveCategory, DefectiveLocation } from '../constants'

export const baseDefectiveGoodsDTO = z.object({
	category: z.nativeEnum(DefectiveCategory),
	po: z.any().nullable().optional(),
	mo_no: z.any().nullable().optional(),
	brand_name: z.string().trim().nonempty(),
	cust_shoes_style: z.string().trim().nonempty(),
	factory_shoes_style: z.string().trim().nonempty(),
	color_sn: z.string().trim().nonempty(),
	size_code: z.string().nonempty(),
	defect_location: z.nativeEnum(DefectiveLocation),
	defect_description: z.string().nonempty()
})

export const createDefectiveGoodsDTO = baseDefectiveGoodsDTO
	.extend({
		epc: z.array(z.string().trim().nonempty()).or(z.string().trim().nonempty())
	})
	.required()
	.refine(
		(values) => {
			if (values.category === DefectiveCategory.B_GRADE) return !!values.po && !!values.mo_no
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
			if (values.category === DefectiveCategory.B_GRADE)
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

export const deleteManyDefectiveGoodsDTO = z.array(z.number().int().positive()).nonempty()

export type CreateDefectiveGoodsDTO = z.infer<typeof createDefectiveGoodsDTO>
export type UpdateDefectiveGoodsDTO = z.infer<typeof updateDefectiveGoodsDTO>
export type DeleteManyDefectiveGoodsDTO = z.infer<typeof deleteManyDefectiveGoodsDTO>
