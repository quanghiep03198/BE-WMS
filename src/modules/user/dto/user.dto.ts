import { FactoryCode } from '@/modules/department/constants'
import { z } from 'zod'
import { UserRoles } from '../constants'

export const registerValidator = z.object({
	username: z.string({ message: 'Username is required' }).trim().nonempty({ message: 'Username is required' }).min(3),
	password: z
		.string({ message: 'Password is required' })
		.trim()
		.nonempty({ message: 'Password is required' })
		.min(6, { message: 'Password must be at least 6 characters long' }),
	email: z.string().trim().email({ message: 'Invalid email' }).optional(),
	display_name: z.string().trim().nonempty(),
	employee_code: z.string().trim().nonempty().optional(),
	role: z.nativeEnum(UserRoles),
	authorized_factory_codes: z.array(z.nativeEnum(FactoryCode))
})

export const updateProfileValidator = z.object({
	email: z.string().trim().email().optional(),
	phone: z.string().trim().min(10).max(11).optional()
})

export const changePasswordValidator = z.object({
	password: z.string().min(1, { message: 'This field is required' })
})

export type CreateUserDTO = z.infer<typeof registerValidator>
export type UpdateProfileDTO = z.infer<typeof updateProfileValidator>
export type ChangePasswordDTO = z.infer<typeof changePasswordValidator>
