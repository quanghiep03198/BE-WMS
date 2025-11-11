import z from 'zod'

export const createDeliveryDTO = z.object({
	licence_plate: z.string().nonempty(),
	departure_time: z.coerce.date(),
	container_number: z
		.string()
		.nonempty()
		.transform((value) => value.toLocaleUpperCase()),
	outbound_qty: z.number().int().nonnegative()
})

export const updateDeliveryDTO = createDeliveryDTO.partial()

export type CreateDeliveryDTO = z.infer<typeof createDeliveryDTO>
export type UpdateDeliveryDTO = z.infer<typeof updateDeliveryDTO>
