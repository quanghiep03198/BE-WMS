import { CommonRequestHeader } from '@/common/constants'
import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import { ThirdPartyApiOAuth2Service } from './strategies/third-party-api-oauth2.service'

@Injectable()
export class ThirdPartyApiMiddleware implements NestMiddleware {
	constructor(private readonly thirdPartyApiOAuth2Service: ThirdPartyApiOAuth2Service) {}

	async use(request: FastifyRequest['raw'], _: FastifyReply['raw'], next: () => void) {
		const factoryCode = request.headers['x-user-company'] as string
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		const accessToken = await this.thirdPartyApiOAuth2Service.authenticate(factoryCode)
		request.headers[CommonRequestHeader.ACCESS_TOKEN] = accessToken
		request.headers[CommonRequestHeader.FACTORY_CODE] = factoryCode
		next()
	}
}
