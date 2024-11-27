import { z } from 'zod'

export const updatePackingWeightValidator = z.object({
	Actual_weight_in: z.number().positive().default(0)
})

export type UpdatePackingWeightDTO = z.infer<typeof updatePackingWeightValidator>
