import { Controller, Get, HttpStatus, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FastifyReply } from 'fastify'
import { PinoLogger } from 'nestjs-pino'

@Controller()
export class AppController {
	constructor(
		private readonly logger: PinoLogger,
		private readonly configService: ConfigService
	) {}

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
}
