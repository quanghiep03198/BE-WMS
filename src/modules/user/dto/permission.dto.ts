import { RecordStatus } from '@/databases/constants'
import { UserRoles } from '@/modules/user/constants'
import { z } from 'zod'

export const storePermissionValidator = z.object({
	is_active: z
		.nativeEnum(RecordStatus, {
			required_error: 'Record status is required',
			invalid_type_error: 'Invalid record status'
		})
		.default(RecordStatus.ACTIVE),
	permission_name: z
		.string({
			required_error: 'Permission name is required',
			invalid_type_error: 'Permission name must be a string'
		})
		.trim()
		.min(1, { message: 'Permission name cannot be empty' })
		.max(100, { message: 'Permission name must be at most 100 characters' }),

	role: z
		.nativeEnum(UserRoles, {
			required_error: 'Role is required',
			invalid_type_error: 'Invalid role'
		})
		.default(UserRoles.USER),

	parent_id: z
		.union([z.string(), z.number(), z.null()])
		.transform((val) => {
			if (val === null || val === '') return null

			if (typeof val === 'number') return val

			const parsed = Number(val)
			return isNaN(parsed) ? null : parsed
		})
		.default(null),
	remark: z.string().nullable().optional()
})

export const updatePermissionValidator = storePermissionValidator.partial()

export type StorePermissionDTO = z.infer<typeof storePermissionValidator>
export type UpdatePermissionDTO = z.infer<typeof updatePermissionValidator>
