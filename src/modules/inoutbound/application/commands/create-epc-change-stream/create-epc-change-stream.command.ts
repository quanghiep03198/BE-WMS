import { InventoryEpcDocument } from '@modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { Command } from '@nestjs/cqrs'
import { mongo } from 'mongoose'

export class CreateEpcChangeStreamCommand extends Command<
	mongo.ChangeStream<InventoryEpcDocument, mongo.ChangeStreamDocument<InventoryEpcDocument>>
> {
	constructor(
		public readonly filterQuery:
			| { 'fullDocument.inbound_device_sn': string }
			| { 'fullDocument.outbound_device_sn': { $ne: null } },

		public readonly onChange: (change: mongo.ChangeStreamDocument<InventoryEpcDocument>) => void
	) {
		super()
	}
}
