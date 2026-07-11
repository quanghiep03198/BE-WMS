import { UseWebSocketAuthGuard } from '@common/decorators'
import { WsExceptionsFilter } from '@common/filters'

import { WsZodValidationPipe } from '@common/pipes/ws-validation.pipe'
import { env } from '@common/utils'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { FALLBACK_VALUE } from '@modules/finished-goods/domain/constants'
import {
	EpcDocument,
	EpcInbound
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { SYNC_INVENTORY_AUDIT_QUEUE } from '@modules/inventory/constants'
import { THIRD_PARTY_API_SYNC } from '@modules/third-party-api/constants'
import { SyncDataMessageDTO, syncDataMessageValidator } from '@modules/third-party-api/dto/third-party-api.dto'
import { InjectQueue } from '@nestjs/bullmq'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Optional, UseFilters, UsePipes } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'
import {
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer
} from '@nestjs/websockets'
import { Queue } from 'bullmq'
import { Cache } from 'cache-manager'
import { format } from 'date-fns'
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
		protected readonly jwtService: JwtService,

		@InjectPinoLogger(EventGateway.name)
		private readonly logger: PinoLogger,

		@Optional()
		@InjectModel(EpcInbound.name, DATA_WAREHOUSE_CONNECTION)
		private readonly epcModel: PaginateModel<EpcDocument>,

		@Optional()
		@InjectQueue(THIRD_PARTY_API_SYNC)
		private readonly syncThirdPartyApiDataQueue: Queue<string[]>,

		@Optional()
		@InjectQueue(SYNC_INVENTORY_AUDIT_QUEUE)
		private readonly syncInventoryAuditDataQueue: Queue<{ year: number; month: number }>,

		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache
	) {}

	@UseWebSocketAuthGuard()
	public async handleConnection(_socket: Socket): Promise<void> {
		void _socket
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
	protected async handleSyncInventoryAuditData(@MessageBody() payload: { year: number; month: number }) {
		if (!this.syncInventoryAuditDataQueue) return

		this.syncInventoryAuditDataQueue.add('sync_inventory_audit_data', payload, {
			jobId: format(new Date(payload.year, payload.month - 1), 'yyyy-MM'),
			removeOnComplete: true,
			removeOnFail: true
		})
	}
}
