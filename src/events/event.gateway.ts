import { FALLBACK_VALUE } from '@/modules/rfid/constants'
import { EpcDocument, EpcInbound } from '@/modules/rfid/schemas/epc.schema'
import { THIRD_PARTY_API_SYNC } from '@/modules/third-party-api/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
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
import { uniqBy } from 'lodash'

import { PaginateModel } from 'mongoose'
import { Socket } from 'socket.io'

@WebSocketGateway({ cors: { origin: '*' } })
export class EventGateway implements OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(EventGateway.name)

	@WebSocketServer()
	server: Socket

	constructor(
		@InjectModel(EpcInbound.name) private readonly epcModel: PaginateModel<EpcDocument>,
		@InjectQueue(THIRD_PARTY_API_SYNC) private readonly thirdApiSyncQueue: Queue
	) {}

	public handleConnection(socket: Socket) {
		this.logger.debug(socket.handshake.headers.authorization)
	}

	public handleDisconnect(client: Socket) {
		this.logger.log(`Client disconnected: ${client.id}`)
	}

	@SubscribeMessage('sync_decker_data')
	protected async onSyncDeckerData(@ConnectedSocket() socket: Socket, @MessageBody() payload: string) {
		const validUnknownEpcs = await this.epcModel.find({ mo_no: FALLBACK_VALUE }).lean(true)
		this.thirdApiSyncQueue.add(
			payload,
			uniqBy(validUnknownEpcs, (item) => item.epc.substring(0, 22)).map((item) => item.epc),
			{
				jobId: socket.handshake.headers['x-user-company'] as string,
				removeOnComplete: true
			}
		)
	}
}
