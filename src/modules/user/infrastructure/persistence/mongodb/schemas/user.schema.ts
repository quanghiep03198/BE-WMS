import { env } from '@common/utils'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { compareSync, hashSync } from 'bcrypt'
import { PaginateModel, Types, type HydratedDocument, type ObjectId } from 'mongoose'
import MongooseDeletePlugin, { SoftDeleteModel } from 'mongoose-delete'
import MongoosePaginatePlugin from 'mongoose-paginate-v2'
import { stringify } from 'node:querystring'
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

	authenticate(password: string) {
		return compareSync(password, this.password)
	}
}

export const UserSchema = SchemaFactory.createForClass(User)

UserSchema.pre('save', function (next) {
	this.password = hashSync(this.password, env<number>('SALT_ROUND', { serialize: (value) => Number.parseInt(value) }))
	next()
})

UserSchema.virtual('avatar').get(function () {
	const BASE_AVATAR_URL = 'https://ui-avatars.com/api/'
	return (
		BASE_AVATAR_URL +
		'?' +
		stringify({
			background: '#525252',
			color: '#fafafa',
			length: 1,
			bold: true,
			format: 'svg',
			name: this.display_name || this.username
		})
	)
})

UserSchema.index({ username: 1 }, { unique: true, name: 'idx_username' })
// * Addon plugins
UserSchema.plugin(MongoosePaginatePlugin)
UserSchema.plugin(MongooseDeletePlugin, { overrideMethods: true })

UserSchema.loadClass(User)

export type UserDocument = HydratedDocument<User>

export type UserModel = PaginateModel<UserDocument> & SoftDeleteModel<UserDocument>
