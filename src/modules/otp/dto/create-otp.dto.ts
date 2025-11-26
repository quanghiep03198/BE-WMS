import z from 'zod'

export const createEmployeeOtpDTO = z.object({
	employee_code: z.string().nonempty()
})

export type CreateEmployeeOtpDTO = z.infer<typeof createEmployeeOtpDTO>
