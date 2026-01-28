import { ZodValidationPipe } from '@/common/pipes'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import {
	BadRequestException,
	ForbiddenException,
	Inject,
	Injectable,
	NotFoundException,
	UsePipes
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Cache } from 'cache-manager'
import { pick } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'

import { RequestUser } from '@/common/decorators'
import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { createHash, randomBytes } from 'node:crypto'
import { DataSource, IsNull, Repository } from 'typeorm'
import { UserRole } from '../user/constants'
import { UserService } from '../user/services/user.service'
import { LoginDTO, loginValidator } from './dto/auth.dto'
import { RefreshTokenEntity } from './entities/refresh-token.entity'

@Injectable()
export class AuthService {
	private readonly TOKEN_CACHE_TTL = 60 * 1000 * 5 // 5 minutes

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectRepository(RefreshTokenEntity, DATA_SOURCE_SYSCLOUD)
		private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
		@InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
		@InjectDataSource(DATA_SOURCE_SYSCLOUD) private readonly dataSource: DataSource,
		private readonly jwtService: JwtService,
		private readonly userService: UserService,
		private readonly i18nService: I18nService
	) {}

	@UsePipes(new ZodValidationPipe(loginValidator))
	async validateUser(payload: LoginDTO) {
		const user = await this.userService.findUserByUsername(payload.username)
		if (!user)
			throw new NotFoundException(this.i18nService.t('auth.user_not_found', { lang: I18nContext.current()?.lang }))
		if (!user.authenticate(payload.password))
			throw new BadRequestException(
				this.i18nService.t('auth.incorrect_password', { lang: I18nContext.current()?.lang })
			)
		return { ...user, is_admin: user.roles.includes(UserRole.ADMIN) }
	}

	async login(payload: RequestUser) {
		const queryRunner = this.dataSource.createQueryRunner()
		await queryRunner.connect()
		await queryRunner.startTransaction()
		try {
			const username = payload.username
			const user = await this.userService.getProfile(username)
			const tokenPayload = pick(user, ['id', 'username', 'employee_code', 'display_name', 'roles'])

			const [accessToken, refreshToken] = await Promise.all([
				this.jwtService.signAsync(tokenPayload),
				this.signRefreshToken(username)
			])

			await this.cacheManager.set(`token:${username}`, accessToken, this.TOKEN_CACHE_TTL)
			await queryRunner.commitTransaction()

			return { user, accessToken, refreshToken }
		} catch (error) {
			if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
			if (queryRunner.isReleased === false) await queryRunner.release()
			throw error
		}
	}

	/**
	 * @description Refresh access token using refresh token base on one-time use and rotation strategy
	 * @param username
	 * @param refreshToken
	 * @returns
	 */
	async refreshToken(username: string, refreshToken: string) {
		try {
		} catch {}
		const isValidRefreshToken = await this.verifyRefreshToken(username, refreshToken)
		if (!isValidRefreshToken) throw new ForbiddenException('Invalid refresh token')

		// * Generate new access token
		const user = await this.userService.findUserByUsername(username)
		if (!user) throw new NotFoundException('User could not be found')

		const userPayload = pick(user, ['id', 'username', 'employee_code', 'display_name', 'roles'])
		const newAccessToken = await this.jwtService.signAsync(userPayload)

		// * Rotate refresh token
		await this.refreshTokenRepository.update(
			{ username, token_hash: this.createHash(refreshToken), revoked_at: IsNull() },
			{ revoked_at: new Date() }
		)
		const newRefreshToken = await this.signRefreshToken(username)

		// * Cache new access token
		await this.cacheManager.set(`token:${username}`, newAccessToken, this.TOKEN_CACHE_TTL)
		return { newAccessToken, newRefreshToken }
	}

	async logout(username: string) {
		// * Revoke cached token
		await Promise.all([
			this.cacheManager.del(`token:${username}`),
			this.refreshTokenRepository.update({ username, revoked_at: IsNull() }, { revoked_at: new Date() })
		])
		return null
	}

	async signRefreshToken(username: string): Promise<string> {
		const opaqueToken = randomBytes(32).toString('base64url')
		const refreshTokenRepository = this.dataSource.getRepository(RefreshTokenEntity)
		const newRefreshToken = refreshTokenRepository.create({
			username,
			token_hash: this.createHash(opaqueToken),
			expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // 30 days
		})
		await refreshTokenRepository.save(newRefreshToken)
		return opaqueToken
	}

	async verifyRefreshToken(username: string, refreshToken: string): Promise<boolean> {
		const tokenHash = this.createHash(refreshToken)
		const storedToken = await this.refreshTokenRepository.findOne({
			where: { username, token_hash: tokenHash, revoked_at: null }
		})
		if (!storedToken) return false
		if (storedToken.expires_at < new Date()) return false
		return true
	}

	private createHash(token: string): string {
		return createHash('sha256').update(token).digest('hex')
	}
}
