import { SortDirection } from '@common/constants'
import { isValid } from 'date-fns'
import { isNil } from 'lodash'
import z from 'zod'
import { TruckloadDeliveryStatus } from '../../domain/constants'

const isWhereClauseExpValid = (value: string) => {
	const WHERE_CLAUSE_REGEX = /^(?<operator>=|\w+|):(?<value>.+)$/
	return value.match(WHERE_CLAUSE_REGEX)
}

const TIME_OF_DAY_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/

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
		approval_status: z.enum(TruckloadDeliveryStatus).optional(),
		'sort.container_number': z.enum(SortDirection).optional(),
		'sort.seal_number': z.enum(SortDirection).optional(),
		'sort.license_plate': z.enum(SortDirection).optional(),
		'sort.total_outbound_qty': z.enum(SortDirection).optional(),
		'sort.created': z.enum(SortDirection).optional(),
		'sort.container_sealing_time': z.enum(SortDirection).optional(),
		'sort.factory_entrance_time': z.enum(SortDirection).optional(),
		'sort.factory_departure_time': z.enum(SortDirection).optional(),
		'sort.actual_departure_time': z.enum(SortDirection).optional(),
		'where.approval_status': z.string().refine(isWhereClauseExpValid).optional(),
		'where.license_plate': z.string().refine(isWhereClauseExpValid).optional(),
		'where.container_number': z.string().refine(isWhereClauseExpValid).optional(),
		'where.seal_number': z.string().refine(isWhereClauseExpValid).optional(),
		'where.po': z.string().refine(isWhereClauseExpValid).optional(),
		'where.created_at': z.string().refine(isWhereClauseExpValid).optional(),
		'where.container_sealing_time': z.string().refine(isWhereClauseExpValid).optional(),
		'where.factory_entrance_time': z.string().refine(isWhereClauseExpValid).optional(),
		'where.factory_departure_time': z.string().refine(isWhereClauseExpValid).optional(),
		'where.actual_departure_time': z.string().refine(isWhereClauseExpValid).optional()
	})
	.optional()

export const createDeliveryDTO = z.object({
	license_plate: z.string().nonempty().nullish(),
	container_number: z
		.string()
		.nonempty()
		.transform((value) => value.toLocaleUpperCase())
		.nullish(),
	seal_number: z
		.string()
		.nonempty()
		.transform((value) => value.toLocaleUpperCase())
		.nullish(),
	outbound_purchase_orders: z
		.array(
			z.object({
				po: z.string({ message: 'ns_validation:required' }).trim().nonempty({ message: 'ns_validation:required' }),
				outbound_qty: z.number({ message: 'ns_validation:required' }).int().positive(),
				status: z.enum(TruckloadDeliveryStatus).default(TruckloadDeliveryStatus.PENDING)
			})
		)
		.min(1)
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
	seal_number: z
		.string()
		.trim()
		.nullish()
		.transform((value) => (isNil(value) ? null : value.toUpperCase())),
	factory_entrance_time: z
		.object({
			date: z.coerce.date(),
			time: z.string().regex(TIME_OF_DAY_REGEX)
		})
		.transform(({ date, time }) => {
			const [, hours, minutes, seconds] = time.match(TIME_OF_DAY_REGEX)
			const entranceTime = new Date(date)
			entranceTime.setHours(Number(hours), Number(minutes), Number(seconds ?? 0), 0)
			return entranceTime
		})
		.optional(),
	factory_departure_time: z
		.object({
			date: z.coerce.date(),
			time: z.string().regex(TIME_OF_DAY_REGEX)
		})
		.transform(({ date, time }) => {
			const [, hours, minutes, seconds] = time.match(TIME_OF_DAY_REGEX)
			const entranceTime = new Date(date)
			entranceTime.setHours(Number(hours), Number(minutes), Number(seconds ?? 0), 0)
			return entranceTime
		})
		.optional(),
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

export const updateContainerConditionDTO = z.object({
	punctured_container: z.boolean().optional(),
	smelling_container: z.boolean().optional(),
	moist_container: z.boolean().optional()
})

export const upsertPurchaseOrdersDTO = z
	.object({
		outbound_purchase_orders: z.array(
			z.object({
				// * Legacy MSSQL row id, ignored - purchase orders are identified by `po` within a dispatch order
				id: z.number().nullish(),
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
	sort?: Partial<
		Record<
			| 'container_number'
			| 'seal_number'
			| 'license_plate'
			| 'total_outbound_qty'
			| 'created'
			| 'container_sealing_time'
			| 'factory_entrance_time'
			| 'factory_departure_time'
			| 'actual_departure_time',
			SortDirection
		>
	>
	where?: Partial<
		Record<
			| 'approval_status'
			| 'license_plate'
			| 'container_number'
			| 'seal_number'
			| 'po'
			| 'created_at'
			| 'container_sealing_time'
			| 'factory_entrance_time'
			| 'factory_departure_time'
			| 'actual_departure_time',
			string
		>
	>
}
