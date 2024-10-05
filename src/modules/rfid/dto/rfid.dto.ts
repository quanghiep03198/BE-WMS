import { z } from 'zod'
import { InventoryActions, InventoryStorageType } from '../constants'

export const updateStockValidator = z
	.object({
		rfid_status: z.nativeEnum(InventoryActions, { required_error: 'Required' }),
		rfid_use: z.nativeEnum(InventoryStorageType, { required_error: 'Required' }),
		dept_code: z.string().optional(),
		storage: z.string().optional(),
		mo_no: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }).nullable()
	})
	.superRefine((values, ctx) => {
		if (values.rfid_status === InventoryActions.INBOUND) {
			if (!values.dept_code) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dept_code'], message: 'Required' })
			}
			if (!values.storage) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['storage'], message: 'Required' })
			}
		} else {
			return true
		}
	})

export const exchangeEpcValidator = z
	.object({
		mo_no: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }),
		mo_no_actual: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }),
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

export type UpdateStockDTO = z.infer<typeof updateStockValidator>
export type ExchangeEpcDTO = z.infer<typeof exchangeEpcValidator>
