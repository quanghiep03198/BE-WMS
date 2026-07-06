import z from 'zod'
import { DefectiveGoodsOutboundPurpose } from '../constants'

export const updateInboundStatusDTO = z.object({
	epcs: z.array(z.string().trim().nonempty()),
	storage_location: z
		.string()
		.trim()
		.nonempty()
		.transform((value) => value.toUpperCase())
})

export const updateOutboundStatusDTO = z
	.object({
		epcs: z.array(z.string().trim().nonempty()),
		outbound_purpose: z.nativeEnum(DefectiveGoodsOutboundPurpose, {
			message: `Outbound purpose must be one of: ${Object.values(DefectiveGoodsOutboundPurpose).join(', ')}`
		}),
		po: z.string().trim().optional()
	})
	.superRefine((values, ctx) => {
		if (values.outbound_purpose === DefectiveGoodsOutboundPurpose.SHIPPING && !values.po) {
			ctx.addIssue({
				path: ['po'],
				code: 'custom',
				message: 'ns_validation:required'
			})
		}
	})

export type UpdateInboundStatusDTO = z.infer<typeof updateInboundStatusDTO>
export type UpdateOutboundStatusDTO = z.infer<typeof updateOutboundStatusDTO>
