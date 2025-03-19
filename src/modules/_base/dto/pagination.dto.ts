import { z } from 'zod'

export const paginationDTO = z.object({
	page: z.number().int().positive().default(1),
	limit: z.number().int().positive().default(10)
})

export type PaginationDTO = z.infer<typeof paginationDTO>
