import { z } from 'zod'

export const updatePackingWeightValidator = z.object({
	Actual_weight_in: z.number().positive().default(0)
})

export const bulkUpdatePackingWeightValidator = z.object({
	po: z.string().nonempty(),
	size: z.string().nonempty(),
	actual_weight_in: z.number()
})

export type UpdatePackingWeightDTO = z.infer<typeof updatePackingWeightValidator>
export type BulkUpdatePackingWeightDTO = z.infer<typeof bulkUpdatePackingWeightValidator>
