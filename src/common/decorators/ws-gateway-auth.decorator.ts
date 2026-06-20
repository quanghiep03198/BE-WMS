import { JwtService, TokenExpiredError } from '@nestjs/jwt'
import { Socket } from 'socket.io'

type GatewayWithJwtService = {
	jwtService: JwtService
}

type GatewayConnectionHandler = (socket: Socket, ...args: unknown[]) => Promise<void> | void

export function UseWebSocketAuthGuard(): MethodDecorator {
	return function (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor): void {
		const originalMethod = descriptor.value as GatewayConnectionHandler | undefined
		if (!originalMethod) return

		descriptor.value = async function (this: GatewayWithJwtService, socket: Socket, ...args: unknown[]) {
			const accessToken = socket.handshake.auth?.accessToken

			if (!accessToken) {
				socket.client._disconnect()
				return
			}

			let payload: Record<string, unknown> | null = null
			try {
				payload = await this.jwtService.verifyAsync<Record<string, unknown>>(accessToken)
			} catch (error) {
				const authError = error instanceof TokenExpiredError ? error : new Error(String(error))
				const isJwtError = authError.name === 'TokenExpiredError'
				if (isJwtError) {
					socket.emit('jwt_expired')
				} else {
					socket.client._disconnect()
				}
			}

			if (!payload) return

			socket.request['user'] = payload
			await originalMethod.call(this, socket, ...args)
		}
	}
}
