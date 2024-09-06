import { z } from 'zod'

export const registerValidator = z.object({
	username: z.string().min(1, { message: 'Username is required' }),
	password: z.string().min(1, { message: 'Password is required' }),
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

export type RegisterDTO = z.infer<typeof registerValidator>
export type UpdateProfileDTO = z.infer<typeof updateProfileValidator>
export type ChangePasswordDTO = z.infer<typeof changePasswordValidator>
