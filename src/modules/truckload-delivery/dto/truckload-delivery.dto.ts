import { SortDirection } from '@common/constants'
import { isValid } from 'date-fns'
import { isNil } from 'lodash'
import z from 'zod'
import { TruckloadDeliveryStatus } from '../constants'

const isWhereClauseExpValid = (value: string) => {
	const WHERE_CLAUSE_REGEX = /^(?<operator>=|\w+|):(?<value>.+)$/
	return value.match(WHERE_CLAUSE_REGEX)
}

export const filterQueryDTO = z
	.object({
		page: z
			.string()
			.refine((value) => !isNaN(+value))
			.transform((value) => +value),
		limit: z
			.string()
			.refine((value) => !isNaN(+value))
			.transform((value) => +value),
		from: z
			.string()
			.refine((value) => isValid(new Date(value)))
			.optional(),
		to: z
			.string()
			.refine((value) => isValid(new Date(value)))
			.optional(),
		approval_status: z.nativeEnum(TruckloadDeliveryStatus).optional(),
		'sort.container_number': z.nativeEnum(SortDirection).optional(),
		'sort.license_plate': z.nativeEnum(SortDirection).optional(),
		'sort.total_outbound_qty': z.nativeEnum(SortDirection).optional(),
		'sort.created': z.nativeEnum(SortDirection).optional(),
		'sort.container_sealing_time': z.nativeEnum(SortDirection).optional(),
		'sort.factory_departure_time': z.nativeEnum(SortDirection).optional(),
		'sort.actual_departure_time': z.nativeEnum(SortDirection).optional(),
		'where.approval_status': z.string().refine(isWhereClauseExpValid).optional(),
		'where.license_plate': z.string().refine(isWhereClauseExpValid).optional(),
		'where.container_number': z.string().refine(isWhereClauseExpValid).optional(),
		'where.po': z.string().refine(isWhereClauseExpValid).optional(),
		'where.created_at': z.string().refine(isWhereClauseExpValid).optional(),
		'where.container_sealing_time': z.string().refine(isWhereClauseExpValid).optional(),
		'where.factory_departure_time': z.string().refine(isWhereClauseExpValid).optional(),
		'where.actual_departure_time': z.string().refine(isWhereClauseExpValid).optional()
	})
	.optional()
// .superRefine((values, ctx) => {
// 	if (isValid(new Date(values['from'])) && isValid(new Date(values['to']))) {
// 		if (isAfter(new Date(values['from']), new Date(values['to']))) {
// 			ctx.addIssue({
// 				code: z.ZodIssueCode.custom,
// 				message: 'From date must be earlier than to date'
// 			})
// 		}
// 	}
// })
// .transform((values) => ({
// 	...values,
// 	...(isValid(new Date(values['from'])) && {
// 		['from']: format(new Date(new Date(values['from']).setHours(0, 0, 0, 0)), 'yyyy-MM-dd HH:mm:ss.SSS')
// 	}),
// 	...(isValid(new Date(values['to'])) && {
// 		['to']: format(new Date(new Date(values['to']).setHours(23, 59, 59, 999)), 'yyyy-MM-dd HH:mm:ss.SSS')
// 	})
// }))

export const createDeliveryDTO = z.object({
	license_plate: z.string().nonempty().nullish(),
	container_number: z
		.string()
		.nonempty()
		.transform((value) => value.toLocaleUpperCase())
		.nullish(),
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
		signature_type: z.enum([
			'ie_signature',
			'warehouse_officer_signature',
			'security_1_signature',
			'security_2_signature'
		]),
		signature: z.string()
	})
	.superRefine((data, ctx) => {
		if (
			data.approval_status &&
			data.signature_type !== 'security_1_signature' &&
			data.signature_type !== 'security_2_signature'
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Only security guard can update approval status'
			})
		}
		if (
			!data.approval_status &&
			(data.signature_type === 'security_1_signature' || data.signature_type === 'security_2_signature')
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Approval status is required when role is security guard'
			})
		}
	})
	.transform((data) => {
		switch (data.signature_type) {
			case 'ie_signature':
				return {
					signature_type: data.signature_type,
					ie_signature: data.signature
				}
			case 'warehouse_officer_signature':
				return {
					signature_type: data.signature_type,
					warehouse_officer_signature: data.signature
				}
			case 'security_1_signature':
				return {
					signature_type: data.signature_type,
					security_1_signature: data.signature,
					approval_status: data.approval_status
				}
			case 'security_2_signature':
				return {
					signature_type: data.signature_type,

					security_2_signature: data.signature,
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
				max_outbound_qty: z.number().positive().nullish().default(Infinity)
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
export type UnflatedFilterQueryDTO = Pick<FilterQueryDTO, 'page' | 'limit' | 'from' | 'approval_status'> & {
	sort: {
		container_number: SortDirection
		license_plate: SortDirection
		outbound_qty: SortDirection
		created: SortDirection
		container_sealing_time: SortDirection
		factory_departure_time: SortDirection
		actual_departure_time: SortDirection
	}
	where: {
		license_plate: string
		container_number: string
		po: string
	}
}
