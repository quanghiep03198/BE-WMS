import { z } from 'zod'

export const updatePackingWeightValidator = z.object({
	// series_number: z.string().min(1, { message: 'Series number is required' }),
	actual_weight_in: z.number().positive().default(0)
})

export type UpdatePackingWeightDTO = z.infer<typeof updatePackingWeightValidator>
