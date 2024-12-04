import { isValid } from 'date-fns'
import { z } from 'zod'

export const searchInventoryQueryValidator = z.object({
	['month.eq']: z
		.string()
		.refine((value) => (value ? isValid(value) : true), { message: 'Invalid month' })
		.optional(),
	['custbrand_id.eq']: z.string().optional()
})

export type SearchInventoryQueryDTO = z.infer<typeof searchInventoryQueryValidator> & { ['factory_code.eq']: string }
