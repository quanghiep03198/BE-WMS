import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Model } from 'mongoose'

export const OTP_SECRET_COLLECTION = 'otp_secrets'

@Schema({
	collection: OTP_SECRET_COLLECTION,
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	versionKey: false,
	suppressReservedKeysWarning: false,
	strict: false,
	strictQuery: false,
	readConcern: { level: 'majority' },
	writeConcern: { w: 'majority' }
})
export class OtpSecret {
	@Prop({ type: String, required: true, unique: true })
	employee_code: string

	@Prop({ type: String, required: true })
	otp_secret: string
}

export const OtpSecretSchema = SchemaFactory.createForClass(OtpSecret)

export type OtpSecretDocument = HydratedDocument<OtpSecret>
export type OtpSecretModel = Model<OtpSecretDocument>
