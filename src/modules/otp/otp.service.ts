// otp.service.ts
import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { authenticator } from 'otplib'
import { DataSource } from 'typeorm'
import { OtpSecret, OtpSecretModel } from './schemas/otp-secret.schema'

@Injectable()
export class OtpService {
	constructor(
		@InjectModel(OtpSecret.name) private readonly otpSecretModel: OtpSecretModel,
		@InjectDataSource(DATA_SOURCE_SYSCLOUD) private readonly dataSourceSC: DataSource,
		private readonly configService: ConfigService
	) {}

	/**
	 * @description Create a new secret key for OTP generation
	 * @returns
	 */
	private generateSecret(): string {
		return authenticator.generateSecret()
	}

	/**
	 * @description Generate OTP based on the secret key
	 * @returns
	 */
	private generateOtp(secret: string): string {
		return authenticator.generate(secret)
	}

	/**
	 * @description Verify the provided OTP against the secret key
	 * @param token
	 * @returns
	 */
	public verifyOtp(token: string, secret): boolean {
		// Verify the token using the secret key
		return authenticator.verify({ token, secret })
	}

	public async getOtpSecret(employeeCode: string): Promise<string> {
		const employeeSecret = await this.otpSecretModel.findOne({ employee_code: employeeCode }).lean(true).exec()
		return employeeSecret?.otp_secret
	}

	async createEmployeeOtp(employeeCode: string) {
		const existedSecurityEmployee = await this.dataSourceSC
			.createQueryBuilder()
			.select('a.employee_name', 'employee_name')
			.select('a.employee_code', 'employee_code')
			.addSelect('b.dept_name', 'dept_name')
			.from('ts_employee', 'a')
			.leftJoin('ts_employeedept', 'c', 'a.employee_code = c.employee_code')
			.leftJoin('ts_dept', 'b', 'a.dept_code = b.dept_code')
			.where('a.employee_code = :employeeCode', { employeeCode })
			// .where('b.dept_name like :deptName', { deptName: '%保衛%' })
			.getRawOne<{
				employee_code: string
				dept_code: string
				dept_name: string
			}>()

		if (!existedSecurityEmployee) throw new NotFoundException('Employee not found')

		const employeeSecret = await this.otpSecretModel
			.findOne({ employee_code: existedSecurityEmployee.employee_code })
			.lean(true)
			.exec()

		if (!employeeSecret) {
			const secret = this.generateSecret()
			const createdEmployeeSecret = await this.otpSecretModel.create({
				employee_code: existedSecurityEmployee.employee_code,
				secret
			})
			return this.generateOtp(createdEmployeeSecret.otp_secret)
		}

		const otp = this.generateOtp(employeeSecret.otp_secret)
		return { otp }
	}
}
