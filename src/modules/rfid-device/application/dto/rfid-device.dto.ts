import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { RFIDDeviceType } from '../../domain/constants'

export const createRFIDDeviceValidator = z.object({
	device_name: z.object({
		vi: z.string().trim().nonempty().optional(),
		en: z.string().trim().nonempty().optional(),
		cn: z.string().trim().nonempty().optional()
	}),
	station_no: z.string().trim().nonempty(),
	tcp_ip: z.ipv4(),
	tcp_port: z.string().regex(/^\d+$/),
	device_sn: z.string().trim().nonempty(),
	device_type: z.enum(RFIDDeviceType)
})

export const updateRFIDDeviceValidator = createRFIDDeviceValidator.partial()

export const deleteRFIDDeviceValidator = z.object({
	ids: z.array(z.string()).check(({ issues, value }) => {
		const isValid = value.every(isValidObjectId)
		if (!isValid) {
			issues.push({ code: 'custom', input: value, message: 'Invalid ObjectId in ids array' })
		}
	})
})

export type CreateRFIDDeviceDTO = z.infer<typeof createRFIDDeviceValidator> & { created_by?: string }
export type UpdateRFIDDeviceDTO = z.infer<typeof updateRFIDDeviceValidator> & { updated_by?: string }
export type DeleteRFIDDeviceDTO = z.infer<typeof deleteRFIDDeviceValidator>
