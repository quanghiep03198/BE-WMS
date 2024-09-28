import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Cache } from 'cache-manager'
import { Request } from 'express'

@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(
		@Inject(CACHE_MANAGER) private cacheManager: Cache,
		private jwtService: JwtService,
		private readonly configService: ConfigService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const token = this.extractTokenFromHeader(request)
		if (!token) throw new UnauthorizedException()
		try {
			const payload = await this.jwtService.verifyAsync(token, {
				secret: this.configService.get('JWT_SECRET')
			})
			const cachedToken = await this.cacheManager.get(`token:${payload.id}`)
			if (!cachedToken) throw new UnauthorizedException()
			request['user'] = payload
		} catch {
			throw new UnauthorizedException()
		}
		return true
	}

	private extractTokenFromHeader(request: Request): string | undefined {
		const [type, token] = request.headers.authorization?.split(' ') ?? []
		return type === 'Bearer' ? token : undefined
	}
}
