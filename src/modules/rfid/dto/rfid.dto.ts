import { z } from 'zod'
import { InventoryActions, InventoryStorageType } from '../constants'

/**
 * @deprecated
 * This validator will be removed in the future
 */
export const updateStockValidator = z
	.object({
		rfid_status: z.nativeEnum(InventoryActions, { required_error: 'Required' }),
		rfid_use: z.nativeEnum(InventoryStorageType, { required_error: 'Required' }),
		dept_code: z.string().optional(),
		dept_name: z.string().optional(),
		storage: z.string().optional()
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

export const deliverInventoryValidator = z.array(
	z
		.object({
			rfid_status: z.nativeEnum(InventoryActions, { required_error: 'Required' }),
			rfid_use: z.nativeEnum(InventoryStorageType, { required_error: 'Required' }),
			dept_code: z.string().optional(),
			dept_name: z.string().optional(),
			storage: z.string().optional()
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
)

export const exchangeEpcValidator = z
	.object({
		mo_no: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }),
		mo_no_actual: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }).toUpperCase(),
		size_numcode: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }).optional(),
		mat_code: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }).optional(),
		quantity: z.number({ required_error: 'Required' }).positive().optional(),
		multi: z.boolean().default(false)
	})
	.superRefine((values, ctx) => {
		if (!values.multi) {
			if (!values.size_numcode) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['size_numcode'], message: 'Required' })
			}
			if (!values.mat_code) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mat_code'], message: 'Required' })
			}
			if (!values.quantity) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quantity'], message: 'Required' })
			}
		} else {
			return true
		}
	})

export const searchCustomerValidator = z.object({
	'mo_no.eq': z.string(),
	'mat_code.eq': z.string(),
	'size_num_code.eq': z.string().optional(),
	q: z.string()
})
export const deleteEpcBySizeValidator = z.object({
	'mo_no.eq': z.string(),
	'size_num_code.eq': z.string(),
	'quantity.eq': z.number().positive()
})

export const readerPostDataValidator = z.object({
	method: z.string(),
	sn: z.string(),
	timestamp: z.string(),
	data: z.object({
		timestamp: z.string(),
		id: z.string(),
		temperature: z.string(),
		tagList: z.array(
			z.object({
				direction: z.string(),
				firstTime: z.number(),
				lastTime: z.number(),
				ant: z.number(),
				firstAnt: z.number(),
				rssi: z.string(),
				epc: z.string()
			})
		)
	})
})

/**
 * @deprecated
 * This type will be removed in the future
 */
export type UpdateStockDTO = z.infer<typeof updateStockValidator>
export type DeliverInventoryDTO = z.infer<typeof deliverInventoryValidator>
export type ExchangeEpcDTO = z.infer<typeof exchangeEpcValidator>
export type SearchCustOrderParamsDTO = z.infer<typeof searchCustomerValidator> & {
	['factory_code.eq']: string
}
export type PostReaderDataDTO = z.infer<typeof readerPostDataValidator>
