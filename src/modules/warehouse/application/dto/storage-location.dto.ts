import { isValidObjectId, Types } from 'mongoose'
import { z } from 'zod'

export const createStorageLocationValidator = z.object({
	warehouse: z
		.string()
		.trim()
		.refine((value) => isValidObjectId(new Types.ObjectId(value)))
		.transform((value) => new Types.ObjectId(value)),
	name: z.string().trim().nonempty()
})

export const createBulkStorageLocationValidator = z.object({
	warehouse: z
		.string()
		.trim()
		.refine((value) => isValidObjectId(new Types.ObjectId(value)))
		.transform((value) => new Types.ObjectId(value)),
	locations: z.array(z.object({ name: z.string().trim().nonempty() }))
})

export const updateStorageLocationValidator = z.object({
	name: z.string().trim().nonempty()
})

export const deleteStorageLocationValidator = z
	.object({ ids: z.array(z.string().trim()) })
	.check(({ issues, value }) => {
		for (const [index, id] of value.ids.entries()) {
			if (!isValidObjectId(id)) {
				issues.push({
					code: 'custom',
					input: value,
					message: 'Invalid ObjectId',
					path: ['id', index]
				})
			}
		}
	})

export type CreateStorageLocationDTO = z.infer<typeof createStorageLocationValidator> & { created_by: TObjectId }
export type CreateBulkStorageLocationDTO = z.infer<typeof createBulkStorageLocationValidator>
export type UpdateStorageLocationDTO = z.infer<typeof updateStorageLocationValidator> & { updated_by: TObjectId }
export type DeleteStorageLocationDTO = z.infer<typeof deleteStorageLocationValidator>
