import z from 'zod'

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
			factory_shoes_style: z.string().nonempty(),
			color_sn: z.string().nonempty(),
			mo_no: z.string().nonempty(),
			size_numcode: z.string().nonempty(),
			station_no: z.string().optional(),
			factory_code_produce: z.string().optional()
		})
	)
	.nonempty()

export const searchCustomerValidator = z.object({
	'mo_no.eq': z.string(),
	'factory_shoes_style.eq': z.string(),
	'color_sn.eq': z.string(),
	q: z.string()
})

export type SearchCustOrderParamsDTO = z.infer<typeof searchCustomerValidator> & {
	['factory_code.eq']: string
}
export type PostReaderDataDTO = z.infer<typeof readerPostDataValidator>
export type DeleteScannedEpcDTO = z.infer<typeof deleteEpcValidator>
export type FindEpcBySizeDTO = z.infer<typeof findEpcBySizeValidator>
export type UploadDataDTO = z.infer<typeof uploadDataValidator>
export type RestoreArchivedEpcsDTO = z.infer<typeof restoreArchivedEpcValidator>
