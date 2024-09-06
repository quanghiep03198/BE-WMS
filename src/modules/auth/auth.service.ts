import { UserRoles } from '@/common/constants/global.enum'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Cache } from 'cache-manager'
import { UserEntity } from '../user/entities/user.entity'
import { UserService } from '../user/user.service'
import { LoginDTO } from './dto/auth.dto'

@Injectable()
export class AuthService {
	constructor(
		@Inject(CACHE_MANAGER) private cacheManager: Cache,
		private jwtService: JwtService,
		private configService: ConfigService,
		private userService: UserService
	) {}

	private async generateToken(payload: any) {
		return await this.jwtService.signAsync(payload, {
			secret: this.configService.get('JWT_SECRET')
		})
	}

	async validateUser(payload: LoginDTO) {
		const user = await this.userService.findUserByUsername(payload.username)
		if (!user) throw new NotFoundException('User could not be found')
		if (!user.authenticate(payload.password)) throw new BadRequestException('Password is incorrect')
		return user
	}

	async login(payload: UserEntity) {
		const userId = payload.keyid
		const token = await this.generateToken({ keyid: userId, employeeCode: payload.employee_code })
		const ttl = 60 * 1000 * 60 + 30 * 1000 // 1h + 30s
		await this.cacheManager.set(`token:${userId}`, token, ttl)
		const user = await this.userService.getProfile(userId)
		user['role'] = user.isadmin ? UserRoles.ADMIN : UserRoles.USER
		return { user, token }
	}

	async refreshToken(userId: number) {
		const refreshToken = await this.generateToken({ keyid: userId })
		await this.cacheManager.set(`token:${userId}`, refreshToken)
		return refreshToken
	}

	async logout(userId: number) {
		// Revoke cached token
		await this.cacheManager.del(`token:${userId}`)
		return null
	}
}
