import z from 'zod'
import { DefectiveGoodsOutboundPurpose } from '../constants'

export const updateInboundStatusDTO = z.object({
	epcs: z.array(z.string().trim().nonempty()),
	storage_location: z.string().trim().nonempty(),
	inbound_date: z.date().default(new Date())
})

export const updateOutboundStatusDTO = z.object({
	epcs: z.array(z.string().trim().nonempty()),
	outbound_purpose: z.nativeEnum(DefectiveGoodsOutboundPurpose, {
		message: `Outbound purpose must be one of: ${Object.values(DefectiveGoodsOutboundPurpose).join(', ')}`
	}),
	outbound_date: z.date().default(new Date())
})

export type UpdateInboundStatusDTO = z.infer<typeof updateInboundStatusDTO>
export type UpdateOutboundStatusDTO = z.infer<typeof updateOutboundStatusDTO>
