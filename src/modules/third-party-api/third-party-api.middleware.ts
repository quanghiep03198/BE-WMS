import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { ThirdPartyApiOAuth2Service } from './strategies/third-party-api-oauth2.service'

@Injectable()
export class ThirdPartyApiMiddleware implements NestMiddleware {
	constructor(private readonly thirdPartyApiOAuth2Service: ThirdPartyApiOAuth2Service) {}

	async use(req: Request, _: Response, next: NextFunction) {
		const factoryCode = req.headers['x-user-company'] as string
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		const accessToken = await this.thirdPartyApiOAuth2Service.authenticate(factoryCode)
		req['factoryCode'] = factoryCode
		req['accessToken'] = accessToken
		next()
	}
}
