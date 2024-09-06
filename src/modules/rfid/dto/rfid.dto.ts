import { z } from 'zod'
import { InventoryStorageType, RFIDActions } from '../constants/rfid.enum'

type UpdateStockPayload = {
	rfid_status: RFIDActions
	rfid_use: InventoryStorageType
	warehouse_num?: string
	dept_code?: string
	storage?: string
}

export const updateStockValidator = z

	.object({
		rfid_status: z.nativeEnum(RFIDActions, { required_error: 'Required' }),
		rfid_use: z.nativeEnum(InventoryStorageType, { required_error: 'Required' }),
		warehouse_num: z.string().optional(),
		dept_code: z.string().optional(),
		storage: z.string().optional()
	})
	.superRefine((values, ctx) => {
		if (values.rfid_status === RFIDActions.INBOUND) {
			if (!values.warehouse_num) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['warehouse_num'], message: 'Required' })
			}
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

export type UpdateStockDTO = z.infer<typeof updateStockValidator>
