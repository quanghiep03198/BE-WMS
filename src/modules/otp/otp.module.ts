import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { OTP_GUARD, OtpGuard } from './guards/otp.guard'
import { OtpController } from './otp.controller'
import { OtpService } from './otp.service'
import { OTP_SECRET_COLLECTION, OtpSecret, OtpSecretSchema } from './schemas/otp-secret.schema'

@Module({
	imports: [
		MongooseModule.forFeatureAsync([
			{
				name: OtpSecret.name,
				collection: OTP_SECRET_COLLECTION,
				useFactory: () => OtpSecretSchema
			}
		])
	],
	controllers: [OtpController],
	providers: [OtpService, { provide: OTP_GUARD, useClass: OtpGuard }],
	exports: [MongooseModule, OtpService]
})
export class OtpModule {}
