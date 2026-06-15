import {
	InventoryEpc,
	InventoryEpcModel,
	InventoryEpcSchema
} from '@/modules/rfid/infrastructure/persistence/mongodb/epc.schema'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { AnyBulkWriteOperation } from 'mongoose'
import { GetEpcInformationQuery } from '../../queries/get-epc-information/get-epc-information.query'
import { BulkWriteInventoryCommand } from './bulk-write-inventory.command'

@CommandHandler(BulkWriteInventoryCommand)
export class BulkWriteInventoryCommandHandler implements ICommandHandler<BulkWriteInventoryCommand, void> {
	constructor(
		@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel,
		private readonly queryBus: QueryBus
	) {}

	public async execute({ request }: BulkWriteInventoryCommand) {
		const { data, sn } = request.payload
		const scannedEpcs = await this.queryBus.execute(new GetEpcInformationQuery(data))
		if (scannedEpcs.length === 0) return

		const bulkWriteOptions: AnyBulkWriteOperation<typeof InventoryEpcSchema>[] = scannedEpcs.map((item) => ({
			updateOne: {
				filter: { epc: item.epc, scannable: true },
				update: {
					...item,
					...(request.action === 'inbound' && { inbound_at: null, inbound_device_sn: sn }),
					...(request.action === 'outbound' && { outbound_at: null, outbound_device_sn: sn })
				},
				upsert: true
			}
		}))

		await this.inventoryEpcModel.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}
}
