import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from 'cache-manager'
import { UserEntity } from '../../user/entities/user.entity'
import { UserService } from '../../user/services/user.service'
import { AuthService } from '../auth.service'
import { LoginDTO } from '../dto/auth.dto'

describe('AuthService', () => {
	let authService: AuthService
	let userService: UserService
	let jwtService: JwtService
	let cacheManager: Cache

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuthService,
				{
					provide: CACHE_MANAGER,
					useValue: {
						set: jest.fn(),
						get: jest.fn(),
						del: jest.fn()
					}
				},
				{
					provide: JwtService,
					useValue: {
						signAsync: jest.fn()
					}
				},
				{
					provide: UserService,
					useValue: {
						findUserByUsername: jest.fn(),
						getProfile: jest.fn(),
						findOneById: jest.fn()
					}
				}
			]
		}).compile()

		authService = module.get<AuthService>(AuthService)
		userService = module.get<UserService>(UserService)
		jwtService = module.get<JwtService>(JwtService)
		cacheManager = module.get<Cache>(CACHE_MANAGER)
	})

	it('should be defined', () => {
		expect(authService).toBeDefined()
	})

	describe('validateUser', () => {
		it('should return user if valid', async () => {
			const payload: LoginDTO = { username: 'test', password: 'password' }
			const user = new UserEntity({ id: 1, username: 'test' })
			user.authenticate = jest.fn().mockReturnValue(true)
			jest.spyOn(userService, 'findUserByUsername').mockResolvedValue(user)

			expect(await authService.validateUser(payload)).toEqual(user)
		})

		it('should throw NotFoundException if user not found', async () => {
			const payload: LoginDTO = { username: 'test', password: 'password' }
			jest.spyOn(userService, 'findUserByUsername').mockResolvedValue(null)

			await expect(authService.validateUser(payload)).rejects.toThrow(NotFoundException)
		})

		it('should throw BadRequestException if password is incorrect', async () => {
			const payload: LoginDTO = { username: 'test', password: 'password' }
			const user = new UserEntity({ username: 'test', password: 'wrong_password' })
			user.authenticate = jest.fn().mockReturnValue(false)
			jest.spyOn(userService, 'findUserByUsername').mockResolvedValue(user)

			await expect(authService.validateUser(payload)).rejects.toThrow(BadRequestException)
		})
	})

	describe('login', () => {
		it('should return user and token', async () => {
			const user = new UserEntity({ id: 1, username: 'test' })
			user.id = 1
			jest.spyOn(userService, 'getProfile').mockResolvedValue(user)
			jest.spyOn(jwtService, 'signAsync').mockResolvedValue('token')
			jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined)

			expect(await authService.login(user)).toEqual({ user, token: 'token' })
		})
	})

	describe('refreshToken', () => {
		it('should return new token', async () => {
			const user = new UserEntity({})
			user.id = 1
			jest.spyOn(userService, 'findOneById').mockResolvedValue(user)
			jest.spyOn(jwtService, 'signAsync').mockResolvedValue('newToken')
			jest.spyOn(cacheManager, 'set').mockResolvedValue(undefined)

			expect(await authService.refreshToken(user.id)).toEqual('newToken')
		})

		it('should throw NotFoundException if user not found', async () => {
			jest.spyOn(userService, 'findOneById').mockResolvedValue(null)

			await expect(authService.refreshToken(1)).rejects.toThrow(NotFoundException)
		})
	})

	describe('logout', () => {
		it('should revoke cached token', async () => {
			jest.spyOn(cacheManager, 'del').mockResolvedValue(undefined)

			expect(await authService.logout(1)).toBeNull()
		})
	})
})
