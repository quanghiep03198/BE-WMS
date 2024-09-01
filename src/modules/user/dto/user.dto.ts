import { z } from 'zod'

export const registerValidator = z.object({
	username: z.string().min(1, { message: 'Username is required' }),
	password: z.string().min(1, { message: 'Password is required' }),
	display_name: z.string().min(1, { message: 'Display name is required' })
})

export type RegisterDTO = z.infer<typeof registerValidator>
