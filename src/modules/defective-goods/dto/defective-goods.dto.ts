import { z } from 'zod'
import { DefectiveCategory, DefectiveLocation } from '../constants'

export const baseDefectiveGoodsDTO = z.object({
	epc: z.string().trim().nonempty().length(24),
	defect_category: z.nativeEnum(DefectiveCategory),
	po: z.string().trim().nonempty().optional(),
	mo_no: z.string().trim().nonempty().optional(),
	brand_name: z.string().trim().nonempty(),
	factory_shoes_style: z.string().trim().nonempty(),
	color_sn: z.string().trim().nonempty(),
	size_code: z.string().nonempty(),
	defect_location: z.nativeEnum(DefectiveLocation),
	storage: z.string({ required_error: 'ns_validation:required', message: 'ns_validation:required' }).trim().nonempty(),
	defect_description: z.string().nonempty()
})

export const createDefectiveGoodsDTO = baseDefectiveGoodsDTO.required().refine((values) => {
	if (values.defect_category === DefectiveCategory.B_GRADE) return !!values.po && !!values.mo_no
	return true
})

export const updateDefectiveGoodsDTO = baseDefectiveGoodsDTO.partial().refine((values) => {
	if (values.defect_category === DefectiveCategory.B_GRADE) return !!values.po && !!values.mo_no
	return true
})

export type CreateDefectiveGoodsDTO = z.infer<typeof createDefectiveGoodsDTO>
export type UpdateDefectiveGoodsDTO = z.infer<typeof updateDefectiveGoodsDTO>
