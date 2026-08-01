import { SSEReplyInterface } from '@fastify/sse'

export module 'fastify' {
	export interface FastifyReply {
		sse: SSEReplyInterface
	}
}
