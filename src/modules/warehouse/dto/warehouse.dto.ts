import { z } from 'zod'
import { WarehouseTypes } from '../constants'

export const createWarehouseValidator = z.object({
	warehouse_name: z.string().trim().min(1, { message: 'This field is required' }),
	type_warehouse: z.nativeEnum(WarehouseTypes),
	dept_code: z.string().trim().min(1, { message: 'This field is required' }),
	area: z.number({ required_error: 'This field is required' }).min(0, { message: 'This field is required' }),
	is_disable: z.boolean().default(false),
	is_default: z.boolean().default(false),
	remark: z.string().optional()
})

export const updateWarehouseValidator = createWarehouseValidator.partial()

export const deleteWarehouseValidator = z.object({ id: z.array(z.number()) })

export type CreateWarehouseDTO = z.infer<typeof createWarehouseValidator>
export type UpdateWarehouseDTO = z.infer<typeof updateWarehouseValidator>
export type DeleteWarehouseDTO = z.infer<typeof deleteWarehouseValidator>
