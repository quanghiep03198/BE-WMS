import { Tenant } from '@modules/tenancy/constants'
import { z } from 'zod'

export const updateInventoryReportQuery = z.strictObject({
	// po: z.string().optional(),
	mo_no: z.string(),
	year_month: z.string()
})

const updateInventoryAuditPayload = z.object({
	size_numcode: z.string().nonempty(),
	supplemental_stocked_in_qty: z.number(),
	supplemental_shipped_out_qty: z.number()
})

export const bulkUpdateInventoryAuditPayload = z.array(updateInventoryAuditPayload)

export const productInventoryReportQuery = z.object({
	'brand_name:eq': z.string().nonempty(),
	'shoes_style:eq': z.string().nonempty(),
	'color:eq': z.string().nonempty()
})

export const syncInventoryAuditValidator = z.object({
	tenantId: z.nativeEnum(Tenant)
})

export type SyncInventoryAuditDTO = z.infer<typeof syncInventoryAuditValidator>
export type UpdateInventoryReportQueryDTO = Required<z.infer<typeof updateInventoryReportQuery>>
export type BulkUpdateInventoryReportDTO = Array<Required<z.infer<typeof updateInventoryAuditPayload>>>
export type ProductInventoryReportQueryDTO = z.infer<typeof productInventoryReportQuery>
