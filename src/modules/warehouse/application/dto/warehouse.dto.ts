import { isValidObjectId } from 'mongoose'
import { z } from 'zod'

export const createWarehouseValidator = z.object({
	name: z
		.string()
		.trim()
		.nonempty()
		.transform((value) => value.toUpperCase()),
	capacity: z.number().positive()
})

export const updateWarehouseValidator = createWarehouseValidator.partial()

export const deleteWarehouseValidator = z.object({
	ids: z.array(z.string()).check(({ issues, value }) => {
		const isValid = value.every(isValidObjectId)
		if (!isValid) {
			issues.push({ code: 'custom', input: value, message: 'Invalid ObjectId in ids array' })
		}
	})
})

export type CreateWarehouseDTO = Required<z.infer<typeof createWarehouseValidator> & { created_by: TObjectId }>
export type UpdateWarehouseDTO = z.infer<typeof updateWarehouseValidator> & { updated_by: TObjectId }
export type DeleteWarehouseDTO = z.infer<typeof deleteWarehouseValidator>
