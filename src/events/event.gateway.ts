import { CommonRequestHeader } from '@/common/constants'
import { RequestUser } from '@/common/decorators'
import { WsExceptionsFilter } from '@/common/filters/ws-exception.filter'
import { WsZodValidationPipe } from '@/common/pipes/ws-validation.pipe'
import { env } from '@/common/utils'
import { SYNC_INVENTORY_AUDIT_QUEUE } from '@/modules/inventory/constants'
import { SyncInventoryAuditDTO, syncInventoryAuditValidator } from '@/modules/inventory/dto/inventory-report.dto'
import { FALLBACK_VALUE } from '@/modules/rfid/constants'
import { EpcDocument, EpcInbound } from '@/modules/rfid/schemas/epc.schema'
import { THIRD_PARTY_API_SYNC } from '@/modules/third-party-api/constants'
import { SyncDataMessageDTO, syncDataMessageValidator } from '@/modules/third-party-api/dto/third-party-api.dto'
import { InjectQueue } from '@nestjs/bullmq'
import { Optional, UseFilters, UsePipes } from '@nestjs/common'
import { JsonWebTokenError, JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'
import {
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer
} from '@nestjs/websockets'
import { Queue } from 'bullmq'
import { uniqBy, uniqueId } from 'lodash'
import { PaginateModel } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Server, Socket } from 'socket.io'

const ACCESS_TOKEN_KEY = 'access-token'

@WebSocketGateway({
	cors: {
		origin: env<string>('CORS_ORIGINS').split(','),
		credentials: true
	},
	httpCompression: true
})
export class EventGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server

	constructor(
		private readonly jwtService: JwtService,

		@InjectPinoLogger(EventGateway.name)
		private readonly logger: PinoLogger,

		@Optional()
		@InjectModel(EpcInbound.name)
		private readonly epcModel: PaginateModel<EpcDocument>,

		@Optional()
		@InjectQueue(THIRD_PARTY_API_SYNC)
		private readonly syncThirdPartyApiDataQueue: Queue<string[]>,

		@Optional()
		@InjectQueue(SYNC_INVENTORY_AUDIT_QUEUE)
		private readonly syncInventoryAuditDataQueue: Queue<SyncDataMessageDTO>
	) {}

	/**
	 * @description Register a socket.io middleware that verifies the access token on every incoming event.
	 * This ensures that expired/invalid tokens are caught even after the initial connection handshake.
	 *
	 * * NOTE: `server.use()` runs during handshake (before connection) — socket.emit() won't reach the client.
	 * * `socket.use()` runs AFTER connection, on every incoming event packet — socket.emit() works correctly.
	 */
	public afterInit(server: Server): void {
		server.on('connection', (socket: Socket) => {
			socket.use(async (_event, next) => {
				try {
					const user = await this.verifyAccessToken(socket)
					socket.data.user = user
					next()
				} catch (error) {
					if (error instanceof JsonWebTokenError) {
						this.logger.warn({ socketId: socket.id, error: error.message }, 'Token expired/invalid on event')
						socket.emit('jwt_expired', {
							event: 'jwt_expired',
							ok: false,
							error: { name: error.name, message: error.message }
						})
						return
					}
					next(new Error('Authentication failed'))
				}
			})
		})
	}

	public async handleConnection(socket: Socket): Promise<void> {
		const socketId = socket.id
		const headers = socket.handshake.headers

		try {
			const user = await this.verifyAccessToken(socket)
			socket.data.user = user

			// Attach extra headers sent during reconnect attempts (factory code, username, etc.)
			socket.data.factoryCode = headers[CommonRequestHeader.FACTORY_CODE.toLowerCase()] as string

			this.logger.info({ socketId, username: user.username }, 'Client connected')
		} catch (e) {
			const error = e instanceof JsonWebTokenError ? e : new Error(String(e))
			const isJwtError = error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError'

			this.logger.warn(
				{ socketId, error: error.message },
				isJwtError ? 'Client connected with expired/invalid token' : 'Socket authentication failed'
			)
			this.rejectConnection(socket, error)
		}
	}

	public handleDisconnect(socket: Socket): void {
		this.logger.info({ socketId: socket.id, username: socket.data?.user?.username }, 'Client disconnected')
	}

	/**
	 * @description Extract the access token from the socket handshake cookie header.
	 */
	private extractTokenFromCookie(socket: Socket): string | undefined {
		const cookieHeader = socket.handshake.headers.cookie
		if (!cookieHeader) return undefined

		const tokenCookie = cookieHeader
			.split(';')
			.map((c) => c.trim())
			.find((c) => c.startsWith(`${ACCESS_TOKEN_KEY}=`))

		return tokenCookie?.split('=')[1]
	}

	/**
	 * @description Extract the access token from the Authorization header (Bearer scheme).
	 */
	private extractTokenFromHeader(socket: Socket): string | undefined {
		const authorization = socket.handshake.headers.authorization
		if (!authorization) return undefined

		const [scheme, token] = authorization.split(' ')
		return scheme === 'Bearer' ? token : undefined
	}

	/**
	 * @description Attempt to verify the access token from cookie first, then fallback to Authorization header.
	 * @throws {JsonWebTokenError} If both sources fail verification.
	 */
	private async verifyAccessToken(socket: Socket): Promise<RequestUser> {
		const cookieToken = this.extractTokenFromCookie(socket)
		if (cookieToken) {
			try {
				return await this.jwtService.verifyAsync<RequestUser>(cookieToken)
			} catch {
				this.logger.debug({ socketId: socket.id }, 'Cookie token verification failed, trying Authorization header')
			}
		}

		const headerToken = this.extractTokenFromHeader(socket)
		if (!headerToken) {
			throw new JsonWebTokenError('No valid access token found in cookie or Authorization header')
		}

		return await this.jwtService.verifyAsync<RequestUser>(headerToken)
	}

	/**
	 * @description Reject a socket connection by emitting an auth error and disconnecting.
	 */
	private rejectConnection(socket: Socket, error: Error | JsonWebTokenError): void {
		const isTokenExpired = error instanceof JsonWebTokenError
		const event = isTokenExpired ? 'jwt_expired' : 'auth_error'
		socket.emit(event, {
			event,
			ok: false,
			message: isTokenExpired ? 'Access token has expired. Please refresh your token and reconnect.' : error.message,
			metadata: null
		})
		socket.disconnect(true)
	}

	@SubscribeMessage('sync_decker_data')
	@UseFilters(new WsExceptionsFilter())
	@UsePipes(new WsZodValidationPipe(syncDataMessageValidator))
	protected async handleSyncDeckersData(@MessageBody() payload: SyncDataMessageDTO) {
		if (!this.syncThirdPartyApiDataQueue) return
		const validUnknownEpcs = await this.epcModel
			.distinct('epc', {
				scannable: true,
				mo_no: FALLBACK_VALUE,
				epc: { $regex: /^3034(?!29)/ }
			})
			.lean(true)
		const jobData = uniqBy(validUnknownEpcs, (item) => item.substring(0, 22))
		this.syncThirdPartyApiDataQueue.add(payload.id, jobData, {
			jobId: payload.factory,
			removeOnComplete: true,
			removeOnFail: true
		})
	}

	@SubscribeMessage('sync_inventory_audit_data')
	@UseFilters(new WsExceptionsFilter())
	@UsePipes(new WsZodValidationPipe(syncInventoryAuditValidator))
	protected async handleSyncInventoryAuditData(@MessageBody() payload: SyncInventoryAuditDTO) {
		if (!this.syncInventoryAuditDataQueue) return
		this.syncInventoryAuditDataQueue.add(uniqueId(), {}, { jobId: payload.tenantId })
	}
}
