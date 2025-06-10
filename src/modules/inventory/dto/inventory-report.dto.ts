import { z } from 'zod'
import { InventoryType } from '../constants'

export const updateInventoryReportQuery = z.object({
	po: z.string().optional(),
	mo_no: z.string(),
	shoes_style_code_factory: z.string(),
	cust_shoestyle: z.string(),
	inv_type: z.nativeEnum(InventoryType),
	inv_year_month: z.string()
})

export const updateInventoryReportPayload = z.array(
	z.object({
		size_numcode: z.string().nonempty(),
		mn_ist_qty: z.number(),
		mn_ost_qty: z.number()
	})
)

export const productInventoryReportQuery = z.object({
	'shoes_style.eq': z.string().nonempty(),
	'color.eq': z
		.string()
		.nonempty()
		.transform((value) => value.toUpperCase())
})

export type UpdateInventoryReportQueryDTO = z.infer<typeof updateInventoryReportQuery>
export type UpdateInventoryReportDTO = z.infer<typeof updateInventoryReportPayload>
export type ProductInventoryReportQueryDTO = z.infer<typeof productInventoryReportQuery>
