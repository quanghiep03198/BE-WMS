import { z } from 'zod'
import { ProducingProcessSuffix } from '../constants'

export const processValidator = z.nativeEnum(ProducingProcessSuffix, {
	required_error: 'Producing process is required',
	message: 'Invalid process suffix'
})

export const deleteOrderValidator = z.object({ order: z.string(), process: z.nativeEnum(ProducingProcessSuffix) })

export type ProductingProcessDTO = z.infer<typeof processValidator>
export type DeleteOrderDTO = z.infer<typeof deleteOrderValidator>
export type UpdatePMStockDTO = {
	factoryCode: string
	producingPrcess: ProducingProcessSuffix
	order: string
}
