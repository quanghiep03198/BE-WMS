import { z } from 'zod'
import { StockAction, StockTransactionPurpose } from '../../domain/constants'

export const stockBalancesValidator = z
	.object({
		mo_no: z.string(),
		inbound_device_sn: z.string(),
		action: z.enum(StockAction),
		purpose: z.enum(StockTransactionPurpose),
		assembly_line: z.string().optional(),
		warehouse: z.string().optional(),
		storage_location: z.string().optional(),
		quantity: z.number().optional()
	})
	.check(({ issues, value }) => {
		if (value.action === StockAction.INBOUND) {
			// if (!value.dept_code) {
			// 	issues.push({ code: 'custom', input: value, path: ['dept_code'], error: 'Required' })
			// }
			// if (!value.dept_name) {
			// 	issues.push({ code: 'custom', input: value, path: ['dept_name'], error: 'Required' })
			// }
			if (!value.assembly_line) {
				issues.push({ code: 'custom', input: value, path: ['assembly'], error: 'Required' })
			}
			if (!value.warehouse) {
				issues.push({ code: 'custom', input: value, path: ['warehouse'], error: 'Required' })
			}
			if (!value.storage_location) {
				issues.push({ code: 'custom', input: value, path: ['storage_location'], error: 'Required' })
			}
		}
	})
	.refine((value) => {
		value.quantity = value.action === StockAction.INBOUND ? 1 : -1
		return true
	})

export const exchangeOrderValidator = z.object({
	mo_no: z.string().min(1, { error: 'Required' }),
	mo_no_actual: z.string().min(1, { error: 'Required' }).toUpperCase(),
	factory_shoes_style: z.string().min(1, { error: 'Required' }).optional(),
	color_sn: z.string().min(1, { error: 'Required' }).optional()
})

export const upsertEpcInformationSchema = z.object({
	color_sn: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	color_sn_actual: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	cust_shoes_style: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	mat_code: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	mo_no: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	mo_no_actual: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	mo_noseq: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	or_cust_po: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	or_no: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	quantity: z.number({ error: 'ns_validation:required' }).nonnegative({ error: 'ns_validation:nonnegative' }),
	factory_shoes_style: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	factory_shoes_style_actual: z
		.string({ error: 'ns_validation:required' })
		.nonempty({ error: 'ns_validation:required' }),
	size_code: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	size_numcode: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	size_numcode_actual: z.string({ error: 'ns_validation:required' }).nonempty({ error: 'ns_validation:required' }),
	size_qty: z.number({ error: 'ns_validation:required' }).default(0)
})

export type StockBalancesDTO = Required<z.infer<typeof stockBalancesValidator>>
export type ExchangeOrderDTO = z.infer<typeof exchangeOrderValidator>
export type UpsertEpcInformationDTO = z.infer<typeof upsertEpcInformationSchema>
