import { UseWebSocketAuthGuard } from '@common/decorators'
import { WsExceptionsFilter } from '@common/filters'

import { env } from '@common/utils'
import { SYNC_INVENTORY_AUDIT_QUEUE } from '@modules/inventory/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { Optional, UseFilters } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import {
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer
} from '@nestjs/websockets'
import { Queue } from 'bullmq'
import { format } from 'date-fns'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Server, Socket } from 'socket.io'

@WebSocketGateway({
	namespace: 'inventory',
	cors: {
		origin: env<string>('CORS_ORIGINS').split(','),
		credentials: true
	},
	httpCompression: true
})
export class InventoryGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server

	constructor(
		protected readonly jwtService: JwtService,

		@InjectPinoLogger(InventoryGateway.name)
		private readonly logger: PinoLogger,

		@Optional()
		@InjectQueue(SYNC_INVENTORY_AUDIT_QUEUE)
		private readonly syncInventoryAuditDataQueue: Queue<{ year: number; month: number }>
	) {}

	@UseWebSocketAuthGuard()
	public async handleConnection(_socket: Socket): Promise<void> {
		void _socket
	}

	public handleDisconnect(socket: Socket): void {
		this.logger.info({ socketId: socket.id, username: socket.request?.['user'] }, 'Client disconnected')
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
