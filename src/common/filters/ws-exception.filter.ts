import { ArgumentsHost, Catch } from '@nestjs/common'
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets'
import { Socket } from 'socket.io'

@Catch(WsException)
export class WsExceptionsFilter extends BaseWsExceptionFilter {
	catch<T = unknown>(exception: WsException, host: ArgumentsHost) {
		const ctx = host.switchToWs()
		const client = ctx.getClient<Socket>()
		const data = ctx.getData<T>()
		client.emit(
			ctx.getPattern(),
			JSON.stringify({
				event: ctx.getPattern(),
				ok: false,
				error: exception.getError(),
				metadata: data // Or whatever you want to add
			})
		)
	}
}
