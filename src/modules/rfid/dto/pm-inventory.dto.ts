import { z } from 'zod'

export const updateStockValidator = z.object({ orders: z.array(z.string().nullable()) })

export type UpdateStockDTO = z.infer<typeof updateStockValidator>
