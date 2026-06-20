import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectModel } from '@nestjs/mongoose'
import { InventoryEpc, InventoryEpcModel } from '../../infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { PostReaderDataDTO } from '../dto/rfid-shared.dto'
import { InoutboundGateway } from '../gateways/inoutbound.gateway'

@Injectable()
export class RFIDListener {
	constructor(
		@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel,
		private readonly eventGateway: InoutboundGateway
	) {}

	@OnEvent('rfid.inbound.check', { async: true })
	public async handleCheckRescannedEpcs(payload: PostReaderDataDTO) {
		const epcs = payload.data?.tagList?.map((item) => item.epc.trim()) || []
		const rescannedEpcs = await this.inventoryEpcModel.find({ epc: { $in: epcs }, inbound_at: { $ne: null } }).lean()

		if (rescannedEpcs.length > 0) {
			this.eventGateway.server.emit(
				'rfid.inbound.check',
				rescannedEpcs.map((item) => item.epc)
			)
		}
	}
}
