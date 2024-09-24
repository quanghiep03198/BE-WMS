import { z } from 'zod'

export const paginateOptionValidator = z.object({
	page: z.number().positive().default(1),
	limit: z.number().positive().default(10)
})

export type PaginationOptionsDTO = z.infer<typeof paginateOptionValidator>
