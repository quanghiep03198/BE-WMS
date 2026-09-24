import { DATA_SOURCE_SYSCLOUD, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { Module, OnModuleInit } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { USER_REPOSITORY } from './application/ports/user.repository.port'
import { UserListeners } from './infrastructure/listeners'
import { UserRepository } from './infrastructure/persistence/mongodb/repositories/user.repository'
import { User, USER_COLLECTION, UserModel, UserSchema } from './infrastructure/persistence/mongodb/schemas/user.schema'
import { UserEntity } from './infrastructure/persistence/mssql/entities/user.entity'
import { RmdbsUserRepository } from './infrastructure/persistence/mssql/repositories/rmdbs-user.repository'
import { UserController } from './presentation/controllers/user.controller'

@Module({
	imports: [
		MongooseModule.forFeature(
			[{ name: User.name, collection: USER_COLLECTION, schema: UserSchema }],
			DATA_WAREHOUSE_CONNECTION
		),
		TypeOrmModule.forFeature([UserEntity], DATA_SOURCE_SYSCLOUD)
	],
	providers: [...UserListeners, { provide: USER_REPOSITORY, useClass: UserRepository }, RmdbsUserRepository],
	controllers: [UserController],
	exports: [USER_REPOSITORY]
})
export class UserModule implements OnModuleInit {
	constructor(@InjectModel(User.name, DATA_WAREHOUSE_CONNECTION) private readonly userModel: UserModel) {}

	public async onModuleInit() {
		await this.userModel.syncIndexes()
	}
}
