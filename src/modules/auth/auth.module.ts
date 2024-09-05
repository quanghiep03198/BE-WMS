import { Module } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { UserModule } from '../user/user.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './strategies/jwt.strategy'
import { LocalStrategy } from './strategies/local.strategy'

@Module({
	imports: [JwtModule.register({ global: true }), UserModule],
	controllers: [AuthController],
	providers: [JwtStrategy, LocalStrategy, JwtService, AuthService]
})
export class AuthModule {}
