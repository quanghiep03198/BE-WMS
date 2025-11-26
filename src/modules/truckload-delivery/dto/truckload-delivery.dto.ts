import { isNil } from 'lodash'
import z from 'zod'
import { TruckloadDeliveryStatus } from '../constants'

export const createDeliveryDTO = z.object({
	license_plate: z.string().nonempty().optional(),
	container_number: z
		.string()
		.nonempty()
		.transform((value) => value.toLocaleUpperCase())
		.optional(),
	outbound_purchase_orders: z.array(
		z.object({
			po: z.string({ message: 'ns_validation:required' }).trim().nonempty({ message: 'ns_validation:required' }),
			outbound_qty: z.number({ message: 'ns_validation:required' }).int().positive(),
			status: z.nativeEnum(TruckloadDeliveryStatus).default(TruckloadDeliveryStatus.PENDING)
		})
	)
})

export const updateDeliveryDTO = z.object({
	license_plate: z
		.string()
		.trim()
		.nullish()
		.transform((value) => (isNil(value) ? null : value.toUpperCase())),
	container_number: z
		.string()
		.trim()
		.nullish()
		.transform((value) => (isNil(value) ? null : value.toUpperCase()))
})

export const updateDispatchOrderStatusDTO = z.object({
	approval_status: z.enum([TruckloadDeliveryStatus.CONFIRMED, TruckloadDeliveryStatus.REQUEST_CHANGE]),
	security_code_reviewed: z
		.string()
		.nonempty()
		.transform((value) => value.toUpperCase())
})

export const upsertPurchaseOrdersDTO = z
	.object({
		outbound_purchase_orders: z.array(
			z.object({
				id: z.number().nullable().default(null),
				po: z.string().trim().nonempty(),
				outbound_qty: z.number().int().positive(),
				max_outbound_qty: z.number().nonnegative().default(Infinity)
			})
		)
	})
	.transform((data) => data.outbound_purchase_orders)

export type CreateDeliveryDTO = z.infer<typeof createDeliveryDTO>
export type UpdateDeliveryDTO = z.infer<typeof updateDeliveryDTO>
export type UpdateDispatchOrderStatusDTO = z.infer<typeof updateDispatchOrderStatusDTO>
export type UpsertPurchaseOrdersDTO = z.infer<typeof upsertPurchaseOrdersDTO>
