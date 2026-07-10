import { CommonRequestHeader } from '@common/constants'
import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import { FactoryCode } from '../department/constants'
import { DeckersOAuth2Strategy } from './strategies/deckers-oauth2.strategy'

@Injectable()
export class ThirdPartyApiMiddleware implements NestMiddleware {
	constructor(private readonly thirdPartyApiOAuth2Service: DeckersOAuth2Strategy) {}

	async use(request: FastifyRequest['raw'], _: FastifyReply['raw'], next: () => void) {
		const factoryCode = request.headers['x-user-factory'] as FactoryCode
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		const accessToken = await this.thirdPartyApiOAuth2Service.authenticate(factoryCode)
		request[CommonRequestHeader.ACCESS_TOKEN] = accessToken
		request[CommonRequestHeader.FACTORY_CODE] = factoryCode
		next()
	}
}
