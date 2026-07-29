import { z } from 'zod'
import { InventoryActions, InventoryStorageType } from '../../domain/constants'

export const stockVariationValidator = z
	.object({
		mo_no: z.string(),
		inbound_device_sn: z.string(),
		rfid_status: z.nativeEnum(InventoryActions, { required_error: 'Required' }),
		rfid_use: z.nativeEnum(InventoryStorageType, { required_error: 'Required' }),
		dept_code: z.string().optional(),
		dept_name: z.string().optional(),
		storage: z.string().optional(),
		quantity: z.number().optional()
	})
	.superRefine((values, ctx) => {
		if (values.rfid_status === InventoryActions.INBOUND) {
			if (!values.dept_code) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dept_code'], message: 'Required' })
			}
			if (!values.dept_name) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dept_name'], message: 'Required' })
			}
			if (!values.storage) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['storage'], message: 'Required' })
			}
		} else {
			return true
		}
	})
	.refine((values) => {
		values.quantity = values.rfid_status === InventoryActions.INBOUND ? 1 : -1
		return true
	})

export const exchangeOrderValidator = z.object({
	mo_no: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }),
	mo_no_actual: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }).toUpperCase(),
	factory_shoes_style: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }).optional(),
	color_sn: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }).optional()
})

export const upsertEpcInformationSchema = z.object({
	color_sn: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	color_sn_actual: z
		.string({ required_error: 'ns_validation:required' })
		.nonempty({ message: 'ns_validation:required' }),
	cust_shoes_style: z
		.string({ required_error: 'ns_validation:required' })
		.nonempty({ message: 'ns_validation:required' }),
	mat_code: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	mo_no: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	mo_no_actual: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	mo_noseq: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	or_cust_po: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	or_no: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	quantity: z
		.number({ required_error: 'ns_validation:required' })
		.nonnegative({ message: 'ns_validation:nonnegative' }),
	factory_shoes_style: z
		.string({ required_error: 'ns_validation:required' })
		.nonempty({ message: 'ns_validation:required' }),
	factory_shoes_style_actual: z
		.string({ required_error: 'ns_validation:required' })
		.nonempty({ message: 'ns_validation:required' }),
	size_code: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	size_numcode: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	size_numcode_actual: z
		.string({ required_error: 'ns_validation:required' })
		.nonempty({ message: 'ns_validation:required' }),
	size_qty: z.number({ required_error: 'ns_validation:required' }).default(0)
})

export type StockVariationDTO = Required<z.infer<typeof stockVariationValidator>>
export type ExchangeOrderDTO = z.infer<typeof exchangeOrderValidator>
export type UpsertEpcInformationDTO = z.infer<typeof upsertEpcInformationSchema>
