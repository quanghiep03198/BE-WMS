import { FinishedGoodsEpcDocument } from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { Command } from '@nestjs/cqrs'
import { mongo } from 'mongoose'

export class CreateEpcChangeStreamCommand extends Command<
	mongo.ChangeStream<FinishedGoodsEpcDocument, mongo.ChangeStreamDocument<FinishedGoodsEpcDocument>>
> {
	constructor(
		public readonly filterQuery:
			{ 'fullDocument.inbound_device_sn': string } | { 'fullDocument.outbound_device_sn': { $ne: null } },

		public readonly onChange: (change: mongo.ChangeStreamDocument<FinishedGoodsEpcDocument>) => void
	) {
		super()
	}
}
