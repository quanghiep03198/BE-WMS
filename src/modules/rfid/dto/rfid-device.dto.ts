import { RecordStatus } from '@/databases/constants'
import z from 'zod'

export const createRFIDDeviceDTO = z.object({
	device_sn: z.string({ required_error: 'Required' }).nonempty({ message: 'Required' }),
	station_no: z.string({ required_error: 'Required' }).nonempty({ message: 'Required' }),
	ip_address: z.string({ required_error: 'Required' }).ip({ message: 'Invalid IP value' }),
	ip_port: z
		.string({ required_error: 'Required' })
		.nonempty({ message: 'Required' })
		.regex(/^\d+$/, { message: 'Invalid TCP/IP Port value' }),
	device_ant: z.enum(['0', '1'], { message: 'Required' }),
	is_active: z.nativeEnum(RecordStatus).optional()
})
export const updateRFIDDeviceDTO = createRFIDDeviceDTO.partial()
export const deleteRFIDDeviceDTO = z.array(z.string().nonempty()).nonempty()

export type CreateRFIDDeviceDTO = z.infer<typeof createRFIDDeviceDTO>
export type UpdateRFIDDeviceDTO = z.infer<typeof updateRFIDDeviceDTO>
export type DeleteRFIDDeviceDTO = z.infer<typeof deleteRFIDDeviceDTO>
