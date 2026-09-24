import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { BaseMongoRepository } from '@modules/_base/repositories/base-mongo.abstract.repository'
import { IUserRepository } from '@modules/user/application/ports/user.repository.port'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Types } from 'mongoose'
import { User, UserDocument, UserModel } from '../schemas/user.schema'

@Injectable()
export class UserRepository extends BaseMongoRepository<UserDocument> implements IUserRepository {
	constructor(@InjectModel(User.name, DATA_WAREHOUSE_CONNECTION) private readonly userModel: UserModel) {
		super(userModel)
	}

	override async findAll() {
		return await super.findAll({ is_system_user: false })
	}

	public async findOrCreate(payload: { username: string; password: string }) {
		const user = await super.findOne({ username: payload.username })
		if (user) return user
		return await super.createOne({ ...payload, display_name: payload.username, roles: [] })
	}

	public async updatePassword(id: Types.ObjectId, newPassword: string) {
		const user = await super.findOneById(id)
		if (!user) throw new NotFoundException('User not found')
		user.password = newPassword
		return await user.save()
	}
}
