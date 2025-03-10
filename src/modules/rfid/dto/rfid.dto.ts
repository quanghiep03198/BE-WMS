import { stringToBoolean } from '@/common/utils'
import { z } from 'zod'
import { InventoryActions, InventoryStorageType } from '../constants'
import { FPInventoryEntity } from '../entities/fp-inventory.entity'

export const updateStockValidator = z
	.object({
		rfid_status: z.nativeEnum(InventoryActions, { required_error: 'Required' }),
		rfid_use: z.nativeEnum(InventoryStorageType, { required_error: 'Required' }),
		dept_code: z.string().optional(),
		readable_tenant: z.string(),
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
	shoes_style_code_factory: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }).optional(),
	mat_ecolor: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }).optional()
})

export const exchangeEpcValidator = z.object({
	mo_no: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	mo_no_actual: z
		.string({ required_error: 'ns_validation:required' })
		.nonempty({ message: 'ns_validation:required' })
		.optional(),
	mo_noseq: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	or_no: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	or_cust_po: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	mat_code: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	shoes_style_code_factory: z
		.string({ required_error: 'ns_validation:required' })
		.nonempty({ message: 'ns_validation:required' }),
	cust_shoes_style: z
		.string({ required_error: 'ns_validation:required' })
		.nonempty({ message: 'ns_validation:required' }),
	size_numcode: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	size_code: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
	size_qty: z
		.number({ required_error: 'ns_validation:required' })
		.nonnegative({ message: 'ns_validation:nonnegative' })
		.default(0),
	quantity: z
		.number({ required_error: 'ns_validation:required' })
		.nonnegative({ message: 'ns_validation:nonnegative' })
})

export const searchCustomerValidator = z.object({
	'mo_no.eq': z.string(),
	'shoes_style_code_factory.eq': z.string(),
	'mat_ecolor.eq': z.string(),
	q: z.string()
})

export const deleteEpcValidator = z.object({
	'mo_no.eq': z.string(),
	'size_numcode.eq': z.string().optional(),
	'quantity.eq': z
		.string()
		.optional()
		.refine(
			(value) => {
				if (!value) return true
				return !isNaN(Number(value))
			},
			{ message: 'Invalid quantity' }
		)
		.transform((value) => Number(value)),
	f: z
		.string()
		.optional()
		.default('false')
		.transform((value) => stringToBoolean(value))
})

export const readerPostDataValidator = z.object({
	method: z.string().optional(),
	sn: z.string().optional(),
	timestamp: z.string().nullable().optional(),
	data: z.object({
		id: z.string(),
		timestamp: z.string().optional(),
		temperature: z.string().optional(),
		tagList: z.array(
			z.object({
				ant: z.number(),
				epc: z.string(),
				firstAnt: z.number(),
				firstTime: z.number(),
				lastTime: z.number(),
				direction: z.string().optional(),
				rssi: z.string().optional()
			})
		)
	})
})

export type UpsertStockDTO = z.infer<typeof updateStockValidator> &
	Pick<FPInventoryEntity, 'user_code_created' | 'factory_code'>
export type ExchangeOrderDTO = z.infer<typeof exchangeOrderValidator>
export type ExchangeEpcDTO = z.infer<typeof exchangeEpcValidator>
export type SearchCustOrderParamsDTO = z.infer<typeof searchCustomerValidator> & {
	['factory_code.eq']: string
}
export type PostReaderDataDTO = z.infer<typeof readerPostDataValidator>
export type DeleteScannedEpcDTO = z.infer<typeof deleteEpcValidator>
