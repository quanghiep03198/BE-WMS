import { UseWebSocketAuthGuard } from '@common/decorators'
import { WsExceptionsFilter } from '@common/filters'

import { WsZodValidationPipe } from '@common/pipes/ws-validation.pipe'
import { env, SuperJson } from '@common/utils'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { FALLBACK_VALUE } from '@modules/finished-goods/domain/constants'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcDocument
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { THIRD_PARTY_API_SYNC } from '@modules/third-party-api/constants'
import { SyncDataMessageDTO, syncDataMessageValidator } from '@modules/third-party-api/dto/third-party-api.dto'
import { SyncProcessState } from '@modules/third-party-api/interfaces/third-party-api.interface'
import { InjectQueue } from '@nestjs/bullmq'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, UseFilters, UsePipes } from '@nestjs/common'
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
import { uniqBy } from 'lodash'
import { PaginateModel } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Server, Socket } from 'socket.io'

@WebSocketGateway({
	namespace: 'finished-goods',
	cors: {
		origin: env<string>('CORS_ORIGINS').split(','),
		credentials: true
	},
	httpCompression: true
})
export class FinishedGoodsGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server

	constructor(
		protected readonly jwtService: JwtService,

		@InjectPinoLogger(FinishedGoodsGateway.name)
		private readonly logger: PinoLogger,

		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: PaginateModel<FinishedGoodsEpcDocument>,

		@InjectQueue(THIRD_PARTY_API_SYNC)
		private readonly syncThirdPartyApiDataQueue: Queue<string[]>,

		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache
	) {}

	@UseWebSocketAuthGuard()
	public async handleConnection(socket: Socket): Promise<void> {
		const syncDeckerDataProcess = await this.cacheManager.get<string | undefined>('sync_states:deckers_data')

		// Gửi lại trạng thái sync cho đúng client vừa (re)connect, _không broadcast toàn bộ

		if (SuperJson.isValid(syncDeckerDataProcess)) {
			socket.emit('sync_decker_data', SuperJson.parse<SyncProcessState>(syncDeckerDataProcess))
		}
	}

	public handleDisconnect(socket: Socket): void {
		this.logger.info({ socketId: socket.id, username: socket.request?.['user'] }, 'Client disconnected')
	}

	@SubscribeMessage('sync_decker_data')
	@UseFilters(new WsExceptionsFilter())
	@UsePipes(new WsZodValidationPipe(syncDataMessageValidator))
	protected async handleSyncDeckersData(@MessageBody() payload: SyncDataMessageDTO) {
		const validUnknownEpcs = await this.finishedGoodsEpcModel
			.distinct('epc', {
				scannable: true,
				deleted: false,
				mo_no: FALLBACK_VALUE,
				epc: { $regex: /^3034(?!29)/ }
			})
			.lean(true)

		this.logger.debug(validUnknownEpcs)

		const UNIQUE_VALUE_RANGE = [0, 22] as const

		const jobData = uniqBy(validUnknownEpcs, (item) => item.substring(...UNIQUE_VALUE_RANGE))

		this.syncThirdPartyApiDataQueue.add('sync_deckers_data', jobData, {
			jobId: payload.factory,
			removeOnComplete: true,
			removeOnFail: true
		})
	}
}
