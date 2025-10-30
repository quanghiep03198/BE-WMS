import { RecordStatus } from '@/databases/constants'
import { UserRoles } from '@/modules/user/constants'
import { z } from 'zod'

export const registerValidator = z.object({
	username: z.string({ required_error: 'Username is required' }).min(1, { message: 'Username is required' }),
	password: z
		.string({ required_error: 'Password is required' })
		.min(1, { message: 'Password is required' })
		.refine((value) => value.length >= 6, { message: 'Password must be at least 6 characters' }),
	display_name: z.string().min(1, { message: 'Display name is required' }),
	employee_code: z.string().min(1, { message: 'Employee code is required' })
})

export const updateProfileValidator = z.object({
	email: z.string().trim().email().optional(),
	phone: z.string().trim().min(10).max(11).optional()
})

export const changePasswordValidator = z.object({
	password: z.string().min(1, { message: 'This field is required' })
})

export const updateUserAdmin = z.object({
	keyid: z.number().int(),
	isactive: z.enum(Object.values(RecordStatus) as [string, ...string[]]),
	user_code: z.string().min(1, { message: 'User code is required' }),
	employee_code: z.string(),
	employee_name: z.string().min(1, { message: 'Employee name is required' }),
	user_password: z
		.union([z.string(), z.null()])
		.refine((v) => v === null || v === '' || (typeof v === 'string' && v.length >= 6), {
			message: 'Password must be at least 6 characters'
		}),
	role: z.union([z.enum(Object.values(UserRoles) as [string, ...string[]]), z.literal(''), z.null()]),
	email: z.union([z.string().email({ message: 'Invalid email format' }), z.literal(''), z.null()]),
	birthday: z.preprocess((arg) => {
		if (arg === '' || arg === null || typeof arg === 'undefined') return null
		if (typeof arg === 'string' || typeof arg === 'number') return new Date(arg)
		return arg
	}, z.date().nullable()),
	sex: z.union([z.enum(['M', 'F']), z.literal(''), z.null()])
})

export type RegisterDTO = z.infer<typeof registerValidator>
export type UpdateProfileDTO = z.infer<typeof updateProfileValidator>
export type ChangePasswordDTO = z.infer<typeof changePasswordValidator>
export type UpdateUserAdminDTO = z.infer<typeof updateUserAdmin>
