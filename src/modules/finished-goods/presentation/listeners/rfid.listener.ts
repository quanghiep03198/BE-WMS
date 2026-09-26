import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	SCANNED_INBOUND_EPCS_EVENT,
	ScannedInboundEpcsEvent
} from '@modules/finished-goods/domain/events/scanned-inbound-epcs/scanned-inbound-epcs.event'
import { InjectModel } from '@nestjs/mongoose'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcModel
} from '../../infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { FinishedGoodsGateway } from '../gateways/finished-goods.gateway'

/**
 * @deprecated
 */
@EventListener(SCANNED_INBOUND_EPCS_EVENT, { async: true })
export class ScannedInboundEpcsListener implements IEventListener<ScannedInboundEpcsEvent, void> {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		private readonly eventGateway: FinishedGoodsGateway
	) {}

	public async handle({ payload }: ScannedInboundEpcsEvent) {
		// const epcs = payload.data?.tagList?.map((item) => item.epc.trim()) || []
		// const rescannedEpcs = await this.finishedGoodsEpcModel
		// 	.find({ epc: { $in: epcs }, inbound_times: { $gte: 1 } })
		// 	.lean()
		// if (rescannedEpcs.length > 0) {
		// 	this.eventGateway.server.emit(
		// 		'rfid.inbound.check',
		// 		rescannedEpcs.map((item) => item.epc)
		// 	)
		// }
	}
}
