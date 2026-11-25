import { env } from '@common/utils'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { compareSync, hashSync } from 'bcrypt'
import { PaginateModel, Types, type HydratedDocument, type ObjectId } from 'mongoose'
import MongooseDeletePlugin, { SoftDeleteModel } from 'mongoose-delete'
import MongooseLeanVirtuals from 'mongoose-lean-virtuals'
import MongoosePaginatePlugin from 'mongoose-paginate-v2'
import { UserRole } from '../../../../domain/constants'

export const USER_COLLECTION = 'users'

@Schema({
	collection: USER_COLLECTION,
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
export class User {
	@Prop({ type: String, unique: true })
	username: string

	@Prop({ type: String })
	password: string

	@Prop({ type: String })
	email: string

	@Prop({ type: String })
	display_name: string

	@Prop({ type: Boolean, default: false })
	is_system_user: boolean

	@Prop({ type: Types.ObjectId })
	created_by: ObjectId

	@Prop({ type: Types.ObjectId })
	updated_by: ObjectId

	@Prop({ type: Array })
	roles: Array<UserRole>

	deleted: boolean

	authenticate(password: string) {
		return compareSync(password, this.password)
	}
}

export const UserSchema = SchemaFactory.createForClass(User)

UserSchema.loadClass(User) // * To load the class methods into the schema

UserSchema.pre('save', function (next) {
	this.password = hashSync(this.password, env<number>('SALT_ROUND', { serialize: (value) => Number.parseInt(value) }))
	next()
})

UserSchema.virtual('avatar').get(function () {
	const BASE_AVATAR_URL = 'https://api.dicebear.com'
	const avatarURL = new URL(`/10.x/planets/svg`, BASE_AVATAR_URL)

	avatarURL.searchParams.set('seed', this.display_name || this.username)
	avatarURL.searchParams.set('backgroundColor', '262626')
	avatarURL.searchParams.set('backgroundColorFill', 'linear')
	avatarURL.searchParams.set('textColor', 'e5e5e5')
	avatarURL.searchParams.set('lettersVariant', 'single')

	return avatarURL.toString()
})

UserSchema.virtual('status').get(function () {
	return this.deleted ? 'inactive' : 'active'
})

UserSchema.set('toJSON', { virtuals: true })
UserSchema.set('toObject', { virtuals: true })

UserSchema.index({ username: 1 }, { unique: true, name: 'idx_username' })
// * Addon plugins
UserSchema.plugin(MongoosePaginatePlugin)
UserSchema.plugin(MongooseDeletePlugin, { overrideMethods: true })
UserSchema.plugin(MongooseLeanVirtuals)

export type UserDocument = HydratedDocument<User>

export type UserModel = PaginateModel<UserDocument> & SoftDeleteModel<UserDocument>
