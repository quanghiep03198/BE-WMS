import { UserEntity } from '@/modules/user/entities/user.entity'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthService } from '../auth.service'
import { LocalStrategy } from '../strategies/local.strategy'

describe('AuthService', () => {
	let service: AuthService

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [JwtModule.register({ global: true }), TypeOrmModule.forFeature([UserEntity]), ConfigModule],
			providers: [LocalStrategy, JwtService, AuthService, ConfigService]
		}).compile()

		service = module.get<AuthService>(AuthService)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})
})
