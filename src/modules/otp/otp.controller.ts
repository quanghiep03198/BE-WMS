import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller } from '@nestjs/common'
import { createEmployeeOtpDTO, CreateEmployeeOtpDTO } from './dto/create-otp.dto'
import { OtpService } from './otp.service'

@Controller('otp')
export class OtpController {
	constructor(private readonly otpService: OtpService) {}

	@Api({ method: HttpMethod.PUT, endpoint: 'create-employee-otp' })
	@AuthGuard()
	async createEmployeeOtp(@Body(new ZodValidationPipe(createEmployeeOtpDTO)) payload: CreateEmployeeOtpDTO) {
		return await this.otpService.createEmployeeOtp(payload.employee_code)
	}
}
