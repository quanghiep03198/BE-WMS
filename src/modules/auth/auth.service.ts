import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Cache } from 'cache-manager'
import { pick } from 'lodash'
import { UserEntity } from '../user/entities/user.entity'
import { UserService } from '../user/services/user.service'
import { LoginDTO } from './dto/auth.dto'

@Injectable()
export class AuthService {
	constructor(
		@Inject(CACHE_MANAGER) private cacheManager: Cache,
		private jwtService: JwtService,
		private userService: UserService
	) {}

	async validateUser(payload: LoginDTO) {
		const user = await this.userService.findUserByUsername(payload.username)
		if (!user) throw new NotFoundException('User could not be found')
		if (!user.authenticate(payload.password)) throw new BadRequestException('Password is incorrect')
		return user
	}

	async login(payload: UserEntity) {
		const userId = payload.id
		const ttl = 60 * 1000 * 60 + 30 * 1000 // 1h + 30s
		const user = await this.userService.getProfile(userId)
		const token = await this.jwtService.signAsync(pick(user, ['id', 'employee_code', 'role']))
		await this.cacheManager.set(this.takeCacheTokenKey(userId), token, ttl)
		return { user, token }
	}

	async refreshToken(userId: number) {
		const user = await this.userService.findOneById(userId)
		if (!user) throw new NotFoundException('User could not be found')
		const refreshToken = await this.jwtService.signAsync(pick(user, ['id', 'employee_code', 'role']))
		await this.cacheManager.set(this.takeCacheTokenKey(userId), refreshToken)
		return refreshToken
	}

	async logout(userId: number) {
		// Revoke cached token
		await this.cacheManager.del(this.takeCacheTokenKey(userId))
		return null
	}

	private takeCacheTokenKey(userId: number) {
		return `token:${userId}`
	}
}
