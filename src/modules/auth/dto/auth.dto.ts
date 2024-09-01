import { z } from 'zod'

export const loginValidator = z.object({
	username: z.string().min(1, { message: 'Username is required' }),
	password: z.string().min(1, { message: 'Password is required' })
})
export const updateProfileValidator = z.object({
	display_name: z.string().optional()
})

export type LoginDTO = z.infer<typeof loginValidator>
export type UpdateProfileDTO = z.infer<typeof updateProfileValidator>
