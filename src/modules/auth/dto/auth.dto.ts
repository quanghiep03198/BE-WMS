import z from 'zod'

export const loginValidator = z.object({
	username: z.string().trim().nonempty({ message: 'Username is required' }),
	password: z.string().trim().nonempty({ message: 'Password is required' })
})
export const updateProfileValidator = z.object({
	display_name: z.string().optional()
})

export type LoginDTO = z.infer<typeof loginValidator>
export type UpdateProfileDTO = z.infer<typeof updateProfileValidator>
