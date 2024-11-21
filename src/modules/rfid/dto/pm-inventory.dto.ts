import { z } from 'zod'
import { ProducingProcessSuffix } from '../constants'

export const processValidator = z.nativeEnum(ProducingProcessSuffix, {
	required_error: 'Producing process is required',
	message: 'Invalid process suffix'
})

export const deleteOrderQueriesValidator = z.object({
	'mo_no.eq': z.string(),
	'producing_process.eq': z.nativeEnum(ProducingProcessSuffix)
})

export type DeleteOrderQueriesDTO = z.infer<typeof deleteOrderQueriesValidator> & {
	'factory_code.eq': string
}

export type UpdatePMStockParamsDTO = {
	'factory_code.eq': string
	'producing_process.eq': ProducingProcessSuffix
	'mo_no.eq': string
}
