import { BaseAbstractSchema } from '@modules/_base/base.abstract.schema'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { type HydratedDocument, type Model } from 'mongoose'

export const REFRESH_TOKENS_COLLECTION = 'refresh_tokens'

@Schema({
	collection: REFRESH_TOKENS_COLLECTION,
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
export class RefreshToken extends BaseAbstractSchema {
	@Prop({ type: String, required: true })
	token_hash: string

	@Prop({ type: String, required: true })
	username: string

	@Prop({ type: Date, required: true })
	expires_at: Date

	@Prop({ type: Date })
	revoked_at: Date
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken)

RefreshTokenSchema.index({ revoked_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 })
RefreshTokenSchema.index({ username: 1 })
RefreshTokenSchema.index({ token_hash: 1 })

export type RefreshTokenDocument = HydratedDocument<RefreshToken>

export type RefreshTokenModel = Model<RefreshTokenDocument>
