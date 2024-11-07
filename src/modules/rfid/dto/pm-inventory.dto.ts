import { z } from 'zod'
import { ProducingProcessSuffix } from '../constants'

export const processValidator = z.nativeEnum(ProducingProcessSuffix, {
	required_error: 'Producing process is required',
	message: 'Invalid process suffix'
})
export const updateStockValidator = z.object({ orders: z.array(z.string().nullable()) })
export const deleteOrderValidator = z.object({ order: z.string(), process: z.nativeEnum(ProducingProcessSuffix) })

export type UpdateStockDTO = z.infer<typeof updateStockValidator>
export type ProductingProcessDTO = z.infer<typeof processValidator>
export type DeleteOrderDTO = z.infer<typeof deleteOrderValidator>
