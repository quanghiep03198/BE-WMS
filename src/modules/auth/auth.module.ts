import { DATA_SOURCE_SYSCLOUD } from '@databases/constants'
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import 'dotenv/config'
import { UserModule } from '../user/user.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { RefreshTokenEntity } from './entities/refresh-token.entity'
import { LocalStrategy } from './strategies/local.strategy'

@Module({
	imports: [
		UserModule,
		TypeOrmModule.forFeature([RefreshTokenEntity], DATA_SOURCE_SYSCLOUD),
		JwtModule.registerAsync({
			global: true,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					secret: configService.getOrThrow('JWT_SECRET'),
					signOptions: {
						expiresIn: configService.getOrThrow('JWT_EXPIRES')
					}
				}
			}
		})
	],
	controllers: [AuthController],
	providers: [AuthService, LocalStrategy]
})
export class AuthModule {}
