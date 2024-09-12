import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import 'dotenv/config'
import { ExtractJwt, Strategy } from 'passport-jwt'

/**
 * Use JwtGuard instead
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(protected configService: ConfigService) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: configService.getOrThrow<string>('JWT_SECRET')
		})
	}

	async validate(payload: any) {
		return { userId: payload.sub, username: payload.username }
	}
}
