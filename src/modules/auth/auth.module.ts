import { IApplicationConfigFactory } from '@configs/index'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { Module, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import 'dotenv/config'
import { UserModule } from '../user/user.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import {
	REFRESH_TOKENS_COLLECTION,
	RefreshToken,
	RefreshTokenModel,
	RefreshTokenSchema
} from './schemas/refresh-token.schema'
import { LocalStrategy } from './strategies/local.strategy'

@Module({
	imports: [
		UserModule,
		MongooseModule.forFeature(
			[{ name: RefreshToken.name, collection: REFRESH_TOKENS_COLLECTION, schema: RefreshTokenSchema }],
			DATA_WAREHOUSE_CONNECTION
		),
		JwtModule.registerAsync({
			global: true,
			inject: [ConfigService],
			useFactory: (configService: ConfigService<IApplicationConfigFactory, true>) => {
				return {
					secret: configService.getOrThrow<string>('JWT_SECRET'),
					signOptions: {
						expiresIn: configService.getOrThrow('JWT_EXPIRES')
					}
				}
			}
		})
	],
	controllers: [AuthController],
	providers: [AuthService, LocalStrategy],
	exports: [MongooseModule]
})
export class AuthModule implements OnModuleInit {
	constructor(
		@InjectModel(RefreshToken.name, DATA_WAREHOUSE_CONNECTION) private readonly refreshTokenModel: RefreshTokenModel
	) {}

	async onModuleInit() {
		await this.refreshTokenModel.syncIndexes()
	}
}
