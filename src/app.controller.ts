import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FastifyReply, FastifyRequest } from 'fastify'
import { pick } from 'lodash'
import { RequireAuthenticated } from './common/decorators'

@Controller()
export class AppController {
	constructor(private readonly configService: ConfigService) {}

	@Get()
	index(@Res() reply: FastifyReply) {
		if (this.configService.get('NODE_ENV') === 'development') {
			return reply.status(HttpStatus.FOUND).redirect(this.configService.get<string>('POSTMAN_DOCUMENTATION_URL'))
		} else {
			return reply.status(HttpStatus.OK).send({
				message: 'Ok',
				statusCode: HttpStatus.OK
			})
		}
	}

	@Get('agent-ipv4')
	@RequireAuthenticated()
	getClient(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
		const userAgent = request.headers['user-agent']
		return reply.status(HttpStatus.OK).send({ ...pick(request, ['protocol', 'ip']), agent: userAgent })
	}
}
