import { IS_PUBLIC_KEY } from '@/common/decorators'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Cache } from 'cache-manager'
import { FastifyRequest } from 'fastify'

@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		private reflector: Reflector,
		private readonly jwtService: JwtService,
		private readonly configService: ConfigService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass()
		])
		if (isPublic) return true

		const request: FastifyRequest = context.switchToHttp().getRequest()
		const token = request.cookies['access-token']
		if (!token) throw new UnauthorizedException()
		try {
			const payload = await this.jwtService.verifyAsync(token, {
				secret: this.configService.get('JWT_SECRET')
			})
			const cachedToken = await this.cacheManager.get(`token:${payload.username}`)
			if (!cachedToken) throw new UnauthorizedException()
			request['user'] = payload
		} catch {
			throw new UnauthorizedException()
		}
		return true
	}
}
