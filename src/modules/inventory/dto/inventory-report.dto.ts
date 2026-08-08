import { Tenant } from '@modules/tenancy/constants'
import { z } from 'zod'

export const updateInventoryReportQuery = z.object({
	// po: z.string().optional(),
	mo_no: z.string(),
	year_month: z.string()
})

export const updateInventoryReportPayload = z.array(
	z.object({
		size_numcode: z.string().nonempty(),
		supplemental_stocked_in_qty: z.number(),
		supplemental_shipped_out_qty: z.number()
	})
)

export const productInventoryReportQuery = z.object({
	'brand_name:eq': z.string().nonempty(),
	'shoes_style:eq': z.string().nonempty(),
	'color:eq': z.string().nonempty()
})

export const syncInventoryAuditValidator = z.object({
	tenantId: z.nativeEnum(Tenant)
})

export type SyncInventoryAuditDTO = z.infer<typeof syncInventoryAuditValidator>
export type UpdateInventoryReportQueryDTO = z.infer<typeof updateInventoryReportQuery>
export type UpdateInventoryReportDTO = z.infer<typeof updateInventoryReportPayload>
export type ProductInventoryReportQueryDTO = z.infer<typeof productInventoryReportQuery>
