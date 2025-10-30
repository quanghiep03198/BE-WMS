import { UserRoles } from '@/modules/user/constants'
import { z } from 'zod'

export const storePermissionValidator = z.object({
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
		.union([z.number().int({ message: 'Parent ID must be an integer' }), z.null(), z.literal('')])
		.transform((val) => (val === '' ? null : val))
		.default(null)
})

export const updatePermissionValidator = storePermissionValidator.partial()

export type StorePermissionDTO = z.infer<typeof storePermissionValidator>
export type UpdatePermissionDTO = z.infer<typeof updatePermissionValidator>
