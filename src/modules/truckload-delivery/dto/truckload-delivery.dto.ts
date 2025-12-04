import { format, isAfter, isValid } from 'date-fns'
import { isNil } from 'lodash'
import z from 'zod'
import { TruckloadDeliveryStatus } from '../constants'

export const filterQueryDTO = z
	.object({
		from: z.coerce.date().optional(),
		to: z.coerce.date().optional(),
		status: z.nativeEnum(TruckloadDeliveryStatus).optional()
	})
	.optional()
	.superRefine((data, ctx) => {
		if (isValid(new Date(data.from)) && isValid(new Date(data.to))) {
			if (isAfter(new Date(data.from), new Date(data.to))) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'From date must be earlier than to date'
				})
			}
		}
	})
	.transform((values) => ({
		...values,
		...(isValid(new Date(values.from)) && {
			from: format(new Date(new Date(values.from).setHours(0, 0, 0, 0)), 'yyyy-MM-dd HH:mm:ss.SSS')
		}),
		...(isValid(new Date(values.to)) && {
			to: format(new Date(new Date(values.to).setHours(23, 59, 59, 999)), 'yyyy-MM-dd HH:mm:ss.SSS')
		})
	}))

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
		.transform((value) => (isNil(value) ? null : value.toUpperCase())),
	punctured_container: z.boolean().optional(),
	smelling_container: z.boolean().optional(),
	moist_container: z.boolean().optional(),
	remark: z.string().trim().max(255).nullish()
})

export const updateSignatureDTO = z
	.object({
		approval_status: z.enum([TruckloadDeliveryStatus.CONFIRMED, TruckloadDeliveryStatus.REQUEST_CHANGE]).nullish(),
		signature_type: z.enum(['qc_signature', 'warehouse_officer_signature', 'security_guard_signature']),
		signature: z.string()
	})
	.superRefine((data, ctx) => {
		if (data.approval_status && data.signature_type !== 'security_guard_signature') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Only security guard can update approval status'
			})
		}
		if (!data.approval_status && data.signature_type === 'security_guard_signature') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Approval status is required when role is security guard'
			})
		}
	})
	.transform((data) => {
		switch (data.signature_type) {
			case 'qc_signature':
				return { qc_signature: data.signature }
			case 'warehouse_officer_signature':
				return { warehouse_officer_signature: data.signature }
			case 'security_guard_signature':
				return {
					security_guard_signature: data.signature,
					approval_status: data.approval_status
				}
		}
	})

export const updateContainerConditionDTO = z.object({
	punctured_container: z.boolean().optional(),
	smelling_container: z.boolean().optional(),
	moist_container: z.boolean().optional()
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

export type FilterQueryDTO = z.infer<typeof filterQueryDTO>
export type CreateDeliveryDTO = z.infer<typeof createDeliveryDTO>
export type UpdateDeliveryDTO = z.infer<typeof updateDeliveryDTO>
export type UpdateSignatureDTO = z.infer<typeof updateSignatureDTO>
export type UpsertPurchaseOrdersDTO = z.infer<typeof upsertPurchaseOrdersDTO>
export type UpdateContainerConditionDTO = z.infer<typeof updateContainerConditionDTO>
