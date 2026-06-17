import { WsExceptionsFilter } from '@/common/filters'

import { WsZodValidationPipe } from '@/common/pipes/ws-validation.pipe'
import { env, SuperJson } from '@/common/utils'
import { FALLBACK_VALUE } from '@/modules/inoutbound/domain/constants'
import {
	EpcDocument,
	EpcInbound
} from '@/modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { SYNC_INVENTORY_AUDIT_QUEUE } from '@/modules/inventory/constants'
import { SyncStatePayload } from '@/modules/inventory/queues/inventory-audit.consumer'
import { THIRD_PARTY_API_SYNC } from '@/modules/third-party-api/constants'
import { SyncDataMessageDTO, syncDataMessageValidator } from '@/modules/third-party-api/dto/third-party-api.dto'
import { SyncProcessState } from '@/modules/third-party-api/interfaces/third-party-api.interface'
import { IUser } from '@/modules/user/user.interface'
import { InjectQueue } from '@nestjs/bullmq'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Optional, UseFilters, UsePipes } from '@nestjs/common'
import { JwtService, TokenExpiredError } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'
import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer
} from '@nestjs/websockets'
import { Queue } from 'bullmq'
import { Cache } from 'cache-manager'
import { uniqBy } from 'lodash'
import { PaginateModel } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Server, Socket } from 'socket.io'

@WebSocketGateway({
	cors: {
		origin: env<string>('CORS_ORIGINS').split(','),
		credentials: true
	},
	httpCompression: true
})
export class EventGateway implements OnGatewayConnection, OnGatewayDisconnect {
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
		private readonly syncInventoryAuditDataQueue: Queue<SyncDataMessageDTO>,

		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache
	) {}

	public async handleConnection(socket: Socket): Promise<void> {
		const accessToken = socket.handshake.auth?.accessToken

		if (!accessToken) socket.client._disconnect()

		try {
			const payload = await this.jwtService.verifyAsync<Partial<IUser>>(accessToken)
			socket.request['user'] = payload

			const [syncInventoryAuditProcess, syncDeckerDataProcess] = await Promise.all([
				this.cacheManager.get<string | undefined>('sync_states:inventory_audit'),
				this.cacheManager.get<string | undefined>('sync_states:deckers_data')
			])
			// Gửi lại trạng thái sync cho đúng client vừa (re)connect, _không broadcast toàn bộ
			if (SuperJson.isValid(syncInventoryAuditProcess)) {
				socket.emit('sync_inventory_audit_data', SuperJson.parse<SyncStatePayload>(syncInventoryAuditProcess))
			}
			if (SuperJson.isValid(syncDeckerDataProcess)) {
				socket.emit('sync_decker_data', SuperJson.parse<SyncProcessState>(syncDeckerDataProcess))
			}
		} catch (e) {
			const error = e instanceof TokenExpiredError ? e : new Error(String(e))
			const isJwtError = error.name === 'TokenExpiredError'
			if (isJwtError) {
				socket.emit('jwt_expired')
			} else {
				socket.client._disconnect()
			}
		}
	}

	public handleDisconnect(socket: Socket): void {
		this.logger.info({ socketId: socket.id, username: socket.request?.['user'] }, 'Client disconnected')
	}

	// @UseGuards(WebsocketJwtGuard)
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
		this.syncThirdPartyApiDataQueue.add('sync_deckers_data', jobData, {
			jobId: payload.factory,
			removeOnComplete: true,
			removeOnFail: true
		})
	}

	// @UseGuards(WebsocketJwtGuard)
	@SubscribeMessage('sync_inventory_audit_data')
	@UseFilters(new WsExceptionsFilter())
	protected async handleSyncInventoryAuditData(@ConnectedSocket() client: Socket) {
		if (!this.syncInventoryAuditDataQueue) return
		const factoryCode = client.handshake.auth?.factoryCode

		this.syncInventoryAuditDataQueue.add(
			'sync_inventory_audit_data',
			{},
			{
				jobId: factoryCode,
				removeOnComplete: true,
				removeOnFail: true
			}
		)
	}
}
