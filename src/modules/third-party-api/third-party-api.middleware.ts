import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { ThirdPartyApiService } from './third-party-api.service'

@Injectable()
export class ThirdPartyApiMiddleware implements NestMiddleware {
	constructor(private readonly thirdPartyApiService: ThirdPartyApiService) {}

	async use(req: Request, _: Response, next: NextFunction) {
		const factoryCode = req.headers['x-user-company'] as string
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		const accessToken = await this.thirdPartyApiService.authenticate(factoryCode)
		req['factoryCode'] = factoryCode
		req['accessToken'] = accessToken
		next()
	}
}
