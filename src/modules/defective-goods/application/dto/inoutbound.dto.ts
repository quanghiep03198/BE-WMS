import { CombinationStrategy, DefectiveGoodsOutboundPurpose } from '@modules/defective-goods/domain/constants'
import z from 'zod'

export const updateInboundStatusDTO = z
	.object({
		combination_strategy: z.enum(CombinationStrategy),
		epcs: z.array(z.string().trim().nonempty()).optional().default([]),
		storage_location: z
			.string()
			.trim()
			.nonempty()
			.nonoptional()
			.transform((value) => value.toUpperCase())
	})
	.required({ combination_strategy: true, storage_location: true })

export const updateOutboundStatusDTO = z
	.object({
		combination_strategy: z.enum(CombinationStrategy),
		epcs: z.array(z.string().trim().nonempty()).optional().default([]),
		outbound_purpose: z.enum(DefectiveGoodsOutboundPurpose, {
			message: `Outbound purpose must be one of: ${Object.values(DefectiveGoodsOutboundPurpose).join(', ')}`
		}),
		po: z.string().trim().optional()
	})
	.check(({ issues, value }) => {
		if (value.outbound_purpose === DefectiveGoodsOutboundPurpose.SHIPPING && !value.po) {
			issues.push({
				code: 'custom',
				input: value,
				path: ['po'],
				message: 'ns_validation:required'
			})
		}
	})

export type UpdateInboundStatusDTO = z.infer<typeof updateInboundStatusDTO>
export type UpdateOutboundStatusDTO = z.infer<typeof updateOutboundStatusDTO>
