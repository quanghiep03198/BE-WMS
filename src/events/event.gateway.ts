import { WsExceptionsFilter } from '@/common/filters/ws-exception.filter'
import { WsZodValidationPipe } from '@/common/pipes/ws-validation.pipe'
import { SYNC_INVENTORY_AUDIT_QUEUE } from '@/modules/inventory/constants'
import { SyncInventoryAuditDTO, syncInventoryAuditValidator } from '@/modules/inventory/dto/inventory-report.dto'
import { FALLBACK_VALUE } from '@/modules/rfid/constants'
import { EpcDocument, EpcInbound } from '@/modules/rfid/schemas/epc.schema'
import { THIRD_PARTY_API_SYNC } from '@/modules/third-party-api/constants'
import { SyncDataMessageDTO, syncDataMessageValidator } from '@/modules/third-party-api/dto/third-party-api.dto'
import { UserEntity } from '@/modules/user/entities/user.entity'
import { InjectQueue } from '@nestjs/bullmq'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Optional, UseFilters, UsePipes } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
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
import { uniqBy, uniqueId } from 'lodash'
import { PaginateModel } from 'mongoose'
import { PinoLogger } from 'nestjs-pino'
import { Socket } from 'socket.io'

class UnauthorizedSocketException extends Error {
	constructor(message = 'Unauthorized') {
		super(message)
	}
}

@WebSocketGateway({ cors: { origin: '*' } })
export class EventGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Socket

	constructor(
		private readonly logger: PinoLogger,
		private readonly jwtService: JwtService,
		private readonly configService: ConfigService,

		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,

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

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public async handleConnection(client: Socket) {
		try {
			const token = client.handshake.headers.authorization?.replace('Bearer ', '')
			if (!token) {
				this.logger.warn(`Client tried to connect without token: ${client.id}`)
				throw new UnauthorizedSocketException()
			}
			const payload = await this.jwtService.verifyAsync<Partial<UserEntity>>(token, {
				secret: this.configService.get('JWT_SECRET')
			})
			const cachedToken = await this.cacheManager.get(`token:${payload.id}`)
			if (!cachedToken) throw new UnauthorizedSocketException()
		} catch {
			this.logger.warn(`Client tried to connect with invalid token: ${client.id}`)
			client.disconnect()
		}
	}

	public handleDisconnect(client: Socket) {
		this.logger.info(`Client disconnected: ${client.id}`)
	}

	@SubscribeMessage('sync_decker_data')
	@UseFilters(new WsExceptionsFilter())
	@UsePipes(new WsZodValidationPipe(syncDataMessageValidator))
	protected async onSyncDeckerData(@MessageBody() payload: SyncDataMessageDTO) {
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
	protected async onSyncInventoryAuditData(@MessageBody() payload: SyncInventoryAuditDTO) {
		if (!this.syncInventoryAuditDataQueue) return
		this.syncInventoryAuditDataQueue.add(uniqueId(), {}, { jobId: payload.tenantId })
	}
}
