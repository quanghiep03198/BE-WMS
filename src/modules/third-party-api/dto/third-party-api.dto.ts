import z from 'zod'

export const syncDataMessageValidator = z.object({
	id: z.string().nonempty(),
	factory: z.string({ required_error: '"factory" is required' }).nonempty({ message: '"factory" is required' })
})

export type SyncDataMessageDTO = z.infer<typeof syncDataMessageValidator>
