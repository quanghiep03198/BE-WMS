import { FactoryCode } from '@modules/department/constants'
import { z } from 'zod'
import { UserRole } from '../constants'

export const createUserValidator = z.object({
	username: z.string({ message: 'Username is required' }).trim().nonempty({ message: 'Username is required' }).min(3),
	password: z
		.string({ message: 'Password is required' })
		.trim()
		.nonempty({ message: 'Password is required' })
		.min(3, { message: 'Password must be at least 3 characters long' }),
	email: z.string().trim().email({ message: 'Invalid email' }).nullish(),
	display_name: z.string().trim().nonempty(),
	employee_code: z.string().trim().nonempty().nullish(),
	roles: z.array(z.nativeEnum(UserRole)),
	authorized_factory_codes: z.array(z.nativeEnum(FactoryCode))
})

export const updateUserValidator = createUserValidator.partial().omit({ password: true })

export const updateProfileValidator = z.object({
	display_name: z.string().trim().nonempty().optional(),
	email: z.string().trim().email().optional()
})

export const changePasswordValidator = z.object({
	currentPassword: z.string().nonempty(),
	password: z.string().nonempty()
})

export const updateUserStatusValidator = z.object({
	is_active: z.boolean()
})

export type CreateUserDTO = z.infer<typeof createUserValidator>
export type UpdateUserDTO = z.infer<typeof updateUserValidator>
export type UpdateProfileDTO = z.infer<typeof updateProfileValidator>
export type ChangePasswordDTO = z.infer<typeof changePasswordValidator>
export type UpdateUserStatusDTO = z.infer<typeof updateUserStatusValidator>
