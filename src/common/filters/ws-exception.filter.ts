import { ArgumentsHost, Catch, Inject } from '@nestjs/common'
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { Socket } from 'socket.io'
import { Logger } from 'winston'

@Catch(WsException)
export class WsExceptionsFilter extends BaseWsExceptionFilter {
	@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger

	catch<T = unknown>(exception: WsException, host: ArgumentsHost) {
		const ctx = host.switchToWs()
		const client = ctx.getClient<Socket>()
		const data = ctx.getData<T>()
		this.logger.log('error', exception.getError())
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
