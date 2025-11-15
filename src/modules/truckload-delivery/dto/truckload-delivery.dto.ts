import z from 'zod'
import { TruckloadDeliveryStatus } from '../constants'

export const createDeliveryDTO = z.array(
	z.object({
		po: z.string({ message: 'ns_validation:required' }).trim().nonempty({ message: 'ns_validation:required' }),
		outbound_qty: z.number({ message: 'ns_validation:required' }).int().positive(),
		status: z.nativeEnum(TruckloadDeliveryStatus).default(TruckloadDeliveryStatus.PENDING)
	})
)

export const updateDeliveryDTO = z.object({
	po: z.string().trim().nonempty().optional(),
	licence_plate: z.string().nonempty().optional(),
	container_number: z
		.string()
		.nonempty()
		.transform((value) => value.toLocaleUpperCase())
		.optional(),
	outbound_qty: z.number().int().nonnegative().optional()
})
export const deleteManyDeliveryDTO = z.array(z.number().int().nonnegative())

export type CreateDeliveryDTO = z.infer<typeof createDeliveryDTO>
export type UpdateDeliveryDTO = z.infer<typeof updateDeliveryDTO>
export type DeleteManyDeliveryDTO = z.infer<typeof deleteManyDeliveryDTO>
