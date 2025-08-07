import { ArgumentsHost, Catch } from '@nestjs/common'
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets'
import { PinoLogger } from 'nestjs-pino'
import { Socket } from 'socket.io'

@Catch(WsException)
export class WsExceptionsFilter extends BaseWsExceptionFilter {
	private readonly logger: PinoLogger

	catch<T = unknown>(exception: WsException, host: ArgumentsHost) {
		const ctx = host.switchToWs()
		const client = ctx.getClient<Socket>()
		const data = ctx.getData<T>()
		this.logger.error(exception.getError())
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
