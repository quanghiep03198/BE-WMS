import { z } from 'zod'
import { InventoryActions, InventoryStorageType } from '../constants'
import { BaseRFIDInventoryEntity } from '../entities/rifd-inventory.entity'

export const updateStockValidator = z
	.object({
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
	shoes_style_code_factory: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }).optional(),
	color_sn: z.string({ required_error: 'Required' }).min(1, { message: 'Required' }).optional()
})

export const fillEpcDataSchema = z
	.object({
		color_sn: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
		color_sn_actual: z
			.string({ required_error: 'ns_validation:required' })
			.nonempty({ message: 'ns_validation:required' }),
		cust_shoes_style: z
			.string({ required_error: 'ns_validation:required' })
			.nonempty({ message: 'ns_validation:required' }),
		mat_code: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
		mo_no: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
		mo_no_actual: z
			.string({ required_error: 'ns_validation:required' })
			.nonempty({ message: 'ns_validation:required' }),
		mo_noseq: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
		or_cust_po: z
			.string({ required_error: 'ns_validation:required' })
			.nonempty({ message: 'ns_validation:required' }),
		or_no: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
		quantity: z
			.number({ required_error: 'ns_validation:required' })
			.nonnegative({ message: 'ns_validation:nonnegative' }),
		shoes_style_code_factory: z
			.string({ required_error: 'ns_validation:required' })
			.nonempty({ message: 'ns_validation:required' }),
		shoes_style_code_factory_actual: z
			.string({ required_error: 'ns_validation:required' })
			.nonempty({ message: 'ns_validation:required' }),
		size_code: z.string({ required_error: 'ns_validation:required' }).nonempty({ message: 'ns_validation:required' }),
		size_numcode: z
			.string({ required_error: 'ns_validation:required' })
			.nonempty({ message: 'ns_validation:required' }),
		size_numcode_actual: z
			.string({ required_error: 'ns_validation:required' })
			.nonempty({ message: 'ns_validation:required' }),
		size_qty: z
			.number({ required_error: 'ns_validation:required' })
			.nonnegative({ message: 'ns_validation:nonnegative' })
			.default(0)
	})
	.refine((values) => values.quantity <= values.size_qty, {
		message: 'ns_validation:invalid_value',
		path: ['quantity']
	})

export const searchCustomerValidator = z.object({
	'mo_no.eq': z.string(),
	'shoes_style_code_factory.eq': z.string(),
	'color_sn.eq': z.string(),
	q: z.string()
})

export const deleteEpcValidator = z.array(z.string().nonempty()).nonempty()

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
				epc: z.string().nonempty(),
				firstAnt: z.number(),
				firstTime: z.number(),
				lastTime: z.number(),
				direction: z.string().optional(),
				rssi: z.string().optional()
			})
		)
	})
})
export const upsertStockOutValidator = z.object({
	mo_no: z.string().nonempty().or(z.array(z.string().nonempty()).nonempty()),
	po: z.string().nonempty(),
	sizes: z
		.array(
			z.object({
				size_numcode: z.string().nonempty(),
				qty: z.number().min(1).positive()
			})
		)
		.optional()
})

export const findEpcBySizeValidator = z.object({
	'mo_no.eq': z.string(),
	'size_numcode.eq': z.string()
})

export const uploadDataValidator = z.object({
	station: z
		.string()
		.nonempty()
		.transform((val) => val.toUpperCase())
})

export const restoreArchivedEpcValidator = z
	.array(
		z.object({
			epc: z.string().nonempty(),
			shoes_style_code_factory: z.string().nonempty(),
			color_sn: z.string().nonempty(),
			mo_no: z.string().nonempty(),
			size_numcode: z.string().nonempty(),
			station_no: z.string().optional(),
			factory_code_produce: z.string().optional()
		})
	)
	.nonempty()

export type UpsertStockOutDTO = z.infer<typeof upsertStockOutValidator>
export type UpsertStockInDTO = z.infer<typeof updateStockValidator> &
	Pick<BaseRFIDInventoryEntity, 'user_code_created' | 'factory_code'>
export type ExchangeOrderDTO = z.infer<typeof exchangeOrderValidator>
export type FillEpcDataDTO = z.infer<typeof fillEpcDataSchema>
export type SearchCustOrderParamsDTO = z.infer<typeof searchCustomerValidator> & {
	['factory_code.eq']: string
}
export type PostReaderDataDTO = z.infer<typeof readerPostDataValidator>
export type DeleteScannedEpcDTO = z.infer<typeof deleteEpcValidator>
export type FindEpcBySizeDTO = z.infer<typeof findEpcBySizeValidator>
export type UploadDataDTO = z.infer<typeof uploadDataValidator>
export type RestoreArchivedEpcsDTO = z.infer<typeof restoreArchivedEpcValidator>
