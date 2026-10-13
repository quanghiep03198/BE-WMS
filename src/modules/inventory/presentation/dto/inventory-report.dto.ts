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
	'brand_name:eq': z.string().optional(),
	'factory_shoes_style:eq': z.string().optional(),
	'color_sn:eq': z.string().optional()
})

export const syncInventoryAuditValidator = z.object({
	tenantId: z.any()
})

export type SyncInventoryAuditDTO = z.infer<typeof syncInventoryAuditValidator>
export type UpdateInventoryReportQueryDTO = Required<z.infer<typeof updateInventoryReportQuery>>
export type BulkUpdateInventoryReportDTO = Array<Required<z.infer<typeof updateInventoryAuditPayload>>>
export type ProductInventoryReportQueryDTO = z.infer<typeof productInventoryReportQuery>
