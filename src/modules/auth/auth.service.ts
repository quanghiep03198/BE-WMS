import { RequestUser } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IUserRepository, USER_REPOSITORY } from '@modules/user/application/ports/user.repository.port'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import {
	BadRequestException,
	ForbiddenException,
	Inject,
	Injectable,
	NotFoundException,
	UsePipes
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'
import { addDays } from 'date-fns'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { createHash, randomBytes } from 'node:crypto'
import { LoginDTO, loginValidator } from './dto/auth.dto'
import { RefreshToken, RefreshTokenModel } from './schemas/refresh-token.schema'

@Injectable()
export class AuthService {
	private readonly TOKEN_CACHE_TTL = 60 * 1000 * 24 // 24h

	constructor(
		private readonly jwtService: JwtService,
		@Inject(USER_REPOSITORY)
		private readonly userRepository: IUserRepository,
		private readonly i18nService: I18nService,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		@InjectPinoLogger(AuthService.name)
		private readonly logger: PinoLogger,
		@InjectModel(RefreshToken.name, DATA_WAREHOUSE_CONNECTION) private readonly refreshTokenModel: RefreshTokenModel
	) {}

	@UsePipes(new ZodValidationPipe(loginValidator))
	async validateUser(payload: LoginDTO) {
		const user = await this.userRepository.findOrCreate(payload)

		if (!user)
			throw new NotFoundException(this.i18nService.t('auth.user_not_found', { lang: I18nContext.current()?.lang }))
		if (!user.authenticate(payload.password))
			throw new BadRequestException(
				this.i18nService.t('auth.incorrect_password', { lang: I18nContext.current()?.lang })
			)
		return user
	}

	async login(payload: RequestUser) {
		const username = payload.username
		const user = await this.userRepository.findOne({ username })

		const [accessToken, refreshToken] = await Promise.all([
			this.jwtService.signAsync({
				_id: user._id,
				username: user.username,
				display_name: user.display_name,
				roles: user.roles,
				is_system_user: user.is_system_user
			}),
			this.signRefreshToken(username)
		])

		await this.cacheManager.set(`token:${username}`, accessToken, this.TOKEN_CACHE_TTL)

		return {
			user: {
				_id: user._id,
				username: user.username,
				display_name: user.display_name,
				email: user.email,
				avatar: user.avatar,
				roles: user.roles,
				is_system_user: user.is_system_user
			},
			accessToken,
			refreshToken
		}
	}

	/**
	 * @description Refresh access token using refresh token base on one-time use and rotation strategy
	 * @param username
	 * @param refreshToken
	 * @returns
	 */
	async refreshToken(username: string, refreshToken: string) {
		const isValidRefreshToken = await this.verifyRefreshToken(username, refreshToken)
		if (!isValidRefreshToken) throw new ForbiddenException('Invalid refresh token')

		// * Generate new access token
		const user = await this.userRepository.findOne({ username })
		if (!user) throw new NotFoundException('User could not be found')

		const newAccessToken = await this.jwtService.signAsync({
			_id: user._id,
			username: user.username,
			display_name: user.display_name,
			roles: user.roles,
			is_system_user: user.is_system_user
		})

		// * Rotate refresh token
		await this.refreshTokenModel.updateOne(
			{ username, token_hash: this.createHash(refreshToken), revoked_at: null },
			{ revoked_at: new Date() }
		)

		const newRefreshToken = await this.signRefreshToken(username)

		// * Cache new access token
		await this.cacheManager.set(`token:${username}`, newAccessToken, this.TOKEN_CACHE_TTL)
		return { newAccessToken, newRefreshToken }
	}

	async logout(username: string) {
		// * Revoke cached token
		await this.cacheManager.del(`token:${username}`)

		await this.refreshTokenModel.updateOne({ username, revoked_at: null }, { revoked_at: new Date() })

		return null
	}

	async signRefreshToken(username: string): Promise<string> {
		const opaqueToken = randomBytes(32).toString('base64url')

		const newRefreshToken = await this.refreshTokenModel.create({
			username,
			token_hash: this.createHash(opaqueToken),
			expires_at: addDays(new Date(), 30)
		})

		await newRefreshToken.save()

		return opaqueToken
	}

	async verifyRefreshToken(username: string, refreshToken: string): Promise<boolean> {
		const hashedToken = this.createHash(refreshToken)

		const storedToken = await this.refreshTokenModel.findOne({ username, token_hash: hashedToken, revoked_at: null })
		if (!storedToken) return false
		if (storedToken.expires_at < new Date()) return false
		return true
	}

	private createHash(token: string): string {
		return createHash('sha256').update(token).digest('hex')
	}
}
