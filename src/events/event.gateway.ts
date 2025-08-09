import { WsExceptionsFilter } from '@/common/filters/ws-exception.filter'
import { WsZodValidationPipe } from '@/common/pipes/ws-validation.pipe'
import { SYNC_INVENTORY_AUDIT_QUEUE } from '@/modules/inventory/constants'
import { SyncInventoryAuditDTO, syncInventoryAuditValidator } from '@/modules/inventory/dto/inventory-report.dto'
import { FALLBACK_VALUE } from '@/modules/rfid/constants'
import { EpcDocument, EpcInbound } from '@/modules/rfid/schemas/epc.schema'
import { THIRD_PARTY_API_SYNC } from '@/modules/third-party-api/constants'
import { SyncDataMessageDTO, syncDataMessageValidator } from '@/modules/third-party-api/dto/third-party-api.dto'
import { InjectQueue } from '@nestjs/bullmq'
import { Optional, UseFilters, UsePipes } from '@nestjs/common'
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
import { uniqBy, uniqueId } from 'lodash'
import { PaginateModel } from 'mongoose'
import { PinoLogger } from 'nestjs-pino'
import { Socket } from 'socket.io'

@WebSocketGateway({ cors: { origin: '*' } })
export class EventGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Socket

	constructor(
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

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public handleConnection(_: Socket) {}

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
