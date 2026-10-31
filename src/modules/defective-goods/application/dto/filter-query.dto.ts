import z from 'zod'

export const filterQueryDTO = z
	.object({
		epc: z.string().toUpperCase().optional(),
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		brand_name: z.string().default(''),
		defective_category: z.string().default(''),
		factory_shoes_style: z.string().default(''),
		cust_shoes_style: z.string().optional(),
		po: z.string().optional(),
		mo_no: z.string().toUpperCase().default(''),
		color_sn: z.string().toUpperCase().optional(),
		size_numcode: z.string().toUpperCase().optional(),
		assembly_line: z.string().optional(),
		sewing_line: z.string().optional(),
		created_at: z.string().optional(),
		deleted: z.boolean().default(false)
	})
	.optional()

export type FilterQueryDTO = z.infer<typeof filterQueryDTO>
