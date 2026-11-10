import { DefectiveCategory, DefectiveGoodsUnit } from '@modules/defective-goods/domain/constants'
import { z } from 'zod'

export const keysetPaginationDTO = z.object({
	cursor: z.string().max(100).optional(),
	direction: z.enum(['next', 'prev']).default('next').optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).default(50),
	take: z.coerce.number().int().min(1).default(50)
})

export const filterQueryDTO = z
	.object({
		epc: z.string().toUpperCase().optional(),
		brand_name: z.string().optional(),
		defective_category: z.enum(DefectiveCategory).optional(),
		factory_shoes_style: z.string().optional(),
		cust_shoes_style: z.string().optional(),
		po: z.string().optional(),
		mo_no: z.string().toUpperCase().optional(),
		color_sn: z.string().toUpperCase().optional(),
		size_numcode: z.string().toUpperCase().optional(),
		assembly_line: z.string().optional(),
		sewing_line: z.string().optional(),
		created_at: z
			.string()
			.refine((value) => !isNaN(Date.parse(value)), {
				message: 'Invalid date string'
			})
			.optional(),
		unit: z.enum(DefectiveGoodsUnit).optional(),
		deleted: z.literal(false).default(false)
	})
	.optional()

export const inoutboundEpcQueryDTO = filterQueryDTO.unwrap().extend(keysetPaginationDTO.shape)

export type InoutboundEpcQueryDTO = z.infer<typeof inoutboundEpcQueryDTO>

export type FilterQueryDTO = z.infer<typeof filterQueryDTO>
