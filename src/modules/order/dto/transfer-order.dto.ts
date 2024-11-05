import { z } from 'zod'

export const createTransferOrderValidator = z.array(
	z.object({
		brand_name: z.string(),
		custbrand_id : z.string().optional(),
		mo_no: z.string(),
		or_no: z.string(),
		kg_no: z.string(),
		or_custpo: z.string(),
		shoestyle_codefactory: z.string(),
	})
)


export const updateTransferOrderValidator = z.object({
	or_warehouse: z.string().optional(),
	or_location: z.string().optional(),
	new_warehouse: z.string().optional(),
	new_location: z.string().optional(),
	status_approve: z.string().optional(),
	employee_name_approve: z.string().optional(),
	approve_date: z.string().optional()
})
export const deleteTransferOrderValidator = z.array(z.string())

export const getTransferOrderDetailValidator = z.string();

export type CreateTransferOrderDTO = z.infer<typeof createTransferOrderValidator>
export type getTransferOrderDetailValidatorDTO = z.infer<typeof getTransferOrderDetailValidator>
export type UpdateTransferOrderDTO = z.infer<typeof updateTransferOrderValidator>
export type DeleteTransferOrderDTO = z.infer<typeof deleteTransferOrderValidator>
