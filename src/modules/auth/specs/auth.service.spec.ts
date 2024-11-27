import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from 'cache-manager'
import { I18nService } from 'nestjs-i18n'
import { UserEntity } from '../../user/entities/user.entity'
import { UserService } from '../../user/services/user.service'
import { AuthService } from '../auth.service'
import { LoginDTO } from '../dto/auth.dto'
import { LocalStrategy } from '../strategies/local.strategy'

describe('AuthService', () => {
	let authService: AuthService
	let userService: UserService
	let jwtService: JwtService
	let cacheManager: Cache
	let i18nService: I18nService

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuthService,
				{
					provide: CACHE_MANAGER,
					useValue: {
						get: jest.fn(),
						set: jest.fn(),
						del: jest.fn()
					}
				},
				{
					provide: I18nService,
					useValue: {
						t: jest.fn()
					}
				},
				{
					provide: JwtService,
					useValue: {
						signAsync: jest.fn()
					}
				},
				{
					provide: LocalStrategy,
					useValue: {
						validate: jest.fn()
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
		i18nService = module.get<I18nService>(I18nService)
	})

	describe('validateUser', () => {
		it('should throw NotFoundException if user is not found', async () => {
			jest.spyOn(userService, 'findUserByUsername').mockResolvedValue(null)
			jest.spyOn(i18nService, 't').mockReturnValue('User not found')

			await expect(authService.validateUser({ username: 'test', password: 'test' } as LoginDTO)).rejects.toThrow(
				NotFoundException
			)
		})

		it('should throw BadRequestException if password is incorrect', async () => {
			const user = { authenticate: jest.fn().mockReturnValue(false) } as any
			jest.spyOn(userService, 'findUserByUsername').mockResolvedValue(user)
			jest.spyOn(i18nService, 't').mockReturnValue('Incorrect password')

			await expect(authService.validateUser({ username: 'test', password: 'test' } as LoginDTO)).rejects.toThrow(
				BadRequestException
			)
		})

		it('should return user if validation is successful', async () => {
			const user = { authenticate: jest.fn().mockReturnValue(true) } as any
			jest.spyOn(userService, 'findUserByUsername').mockResolvedValue(user)

			const result = await authService.validateUser({ username: 'test', password: 'test' } as LoginDTO)
			expect(result).toBe(user)
		})
	})

	describe('login', () => {
		it('should return user and token', async () => {
			const user = { id: 1, username: 'E001', role: 'admin' } as UserEntity
			const profile = {
				id: 1,
				username: 'test',
				display_name: 'User',
				employee_code: 'E001',
				role: 'admin'
			} as UserEntity & { display_name: string }
			const token = 'token'
			jest.spyOn(userService, 'getProfile').mockResolvedValue(profile)
			jest.spyOn(jwtService, 'signAsync').mockResolvedValue(token)
			jest.spyOn(cacheManager, 'set').mockResolvedValue(null)

			const result = await authService.login(user)
			expect(result).toEqual({ user: profile, token })
			expect(cacheManager.set).toHaveBeenCalledWith(`token:${user.id}`, token, authService['TOKEN_CACHE_TTL'])
		})
	})

	describe('refreshToken', () => {
		it('should throw NotFoundException if user is not found', async () => {
			jest.spyOn(userService, 'findOneById').mockResolvedValue(null)

			await expect(authService.refreshToken(1)).rejects.toThrow(NotFoundException)
		})

		it('should return new token', async () => {
			const user = { id: 1, username: 'E001', role: 'admin' } as UserEntity
			const refreshToken = 'refreshToken'
			jest.spyOn(userService, 'findOneById').mockResolvedValue(user)
			jest.spyOn(jwtService, 'signAsync').mockResolvedValue(refreshToken)
			jest.spyOn(cacheManager, 'set').mockResolvedValue(null)

			const result = await authService.refreshToken(1)
			expect(result).toBe(refreshToken)
			expect(cacheManager.set).toHaveBeenCalledWith(`token:${user.id}`, refreshToken, authService['TOKEN_CACHE_TTL'])
		})
	})

	describe('logout', () => {
		it('should revoke cached token', async () => {
			jest.spyOn(cacheManager, 'del').mockResolvedValue(null)

			const result = await authService.logout(1)
			expect(result).toBeNull()
			expect(cacheManager.del).toHaveBeenCalledWith('token:1')
		})
	})
})
