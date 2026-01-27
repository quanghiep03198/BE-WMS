import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { FastifyRequest } from 'fastify'

export const Cookies = createParamDecorator((data: string, ctx: ExecutionContext) => {
	const request: FastifyRequest = ctx.switchToHttp().getRequest()
	return data ? request.cookies?.[data] : request.cookies
})
