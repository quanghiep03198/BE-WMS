import { Module } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserEntity } from '../user/entities/user.entity'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { LocalStrategy } from './strategies/local.strategy'

@Module({
	imports: [JwtModule.register({ global: true }), TypeOrmModule.forFeature([UserEntity])],
	controllers: [AuthController],
	providers: [LocalStrategy, JwtService, AuthService]
})
export class AuthModule {}
