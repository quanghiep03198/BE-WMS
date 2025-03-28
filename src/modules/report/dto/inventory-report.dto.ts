import { z } from 'zod'
import { InventoryType } from '../constants'

export const updateInventoryReportQuery = z.object({
	po: z.string().nullable().optional(),
	mo_no: z.string().nonempty(),
	shoes_style_code_factory: z.string().nullable().optional(),
	cust_shoestyle: z.string().nonempty(),
	size_numcode: z.string().nonempty(),
	inv_type: z.nativeEnum(InventoryType),
	inv_year_month: z.string().nonempty()
})

export const updateInventoryReportPayload = z.object({
	mn_ist_qty: z.number().optional(),
	mn_ost_qty: z.number().optional(),
	fnl_qty: z.number().optional()
})

export type UpdateInventoryReportQuery = z.infer<typeof updateInventoryReportQuery>
export type UpdateInventoryReportDTO = z.infer<typeof updateInventoryReportPayload>
