import { z } from 'zod'
import { WarehouseStorageTypes } from '../constants'

export const createStorageLocationValidator = z.object({
	storage_name: z
		.string({ required_error: 'This field is required' })
		.trim()
		.min(1, { message: 'This field is required' }),
	type_storage: z.nativeEnum(WarehouseStorageTypes, {
		required_error: 'This field is required',
		message: 'Invalid storage type'
	}),
	warehouse_num: z
		.string({ required_error: 'This field is requried' })
		.trim()
		.min(1, { message: 'This field is required' }),
	warehouse_name: z
		.string({ required_error: 'This field is requried' })
		.trim()
		.min(1, { message: 'This field is required' }),
	is_disable: z.boolean().default(false).optional(),
	is_default: z.boolean().default(false).optional(),
	user_code_created: z.string().optional().nullable(),
	user_name_created: z.string().optional().nullable(),
	user_code_updated: z.string().optional().nullable(),
	user_name_updated: z.string().optional().nullable(),
	remark: z.string().nullable().optional()
})

export const updateStorageLocationValidator = createStorageLocationValidator.partial()
export const deleteStorageLocationValidator = z.object({ id: z.array(z.number()) })

export type CreateStorageLocationDTO = z.infer<typeof createStorageLocationValidator>
export type UpdateStorageLocationDTO = z.infer<typeof updateStorageLocationValidator>
export type DeleteStorageLocationDTO = z.infer<typeof deleteStorageLocationValidator>
