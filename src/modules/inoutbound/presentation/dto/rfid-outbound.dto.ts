import { z } from 'zod'

export const upsertStockOutValidator = z.object({
	mo_no: z.string().nonempty().or(z.array(z.string().nonempty()).nonempty()),
	po: z.string().nonempty(),
	sizes: z
		.array(
			z.object({
				size_numcode: z.string().nonempty(),
				qty: z.number().min(1).positive()
			})
		)
		.optional()
})

export type UpsertStockOutDTO = z.infer<typeof upsertStockOutValidator>
