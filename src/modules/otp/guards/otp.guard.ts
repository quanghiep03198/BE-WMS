import { CommonRequestHeader } from '@/common/constants'
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { OtpService } from '../otp.service'

export const OTP_GUARD = Symbol('OTP_GUARD') as symbol

@Injectable()
export class OtpGuard implements CanActivate {
	constructor(
		@InjectPinoLogger(OtpGuard.name) private readonly logger: PinoLogger,
		private readonly otpService: OtpService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<FastifyRequest>()
		const otp = request.headers[CommonRequestHeader.OTP] as string
		this.logger.debug(otp)

		const employeeCode = request['user']?.employee_code
		const employeeOtpSecret = await this.otpService.getOtpSecret(employeeCode)
		const isSuccess = this.otpService.verifyOtp(otp, employeeOtpSecret)

		this.logger.debug(isSuccess)
		request['signatory'] = isSuccess ? employeeCode : null
		return true
	}
}
