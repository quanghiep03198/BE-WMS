import { z } from 'zod'
import { InventoryType } from '../constants'

export const updateInventoryReportQuery = z.object({
	po: z.string().optional(),
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

export type UpdateInventoryReportQuery = z.infer<typeof updateInventoryReportQuery>
export type UpdateInventoryReportDTO = z.infer<typeof updateInventoryReportPayload>
