import { DATA_WAREHOUSE_CONNECTION } from '@/databases/constants'
import {
	InventoryEpc,
	InventoryEpcModel
} from '@/modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { RestoreDeletedEpcsCommand } from './restore-deleted-epcs.command'

@CommandHandler(RestoreDeletedEpcsCommand)
export class RestoreDeletedEpcsHandler implements ICommandHandler<RestoreDeletedEpcsCommand> {
	constructor(
		@InjectModel(InventoryEpc.name, DATA_WAREHOUSE_CONNECTION) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async execute({ epcs }: RestoreDeletedEpcsCommand): Promise<void> {
		await this.inventoryEpcModel.updateManyDeleted(
			{ epc: { $in: epcs } },
			{ deleted: false, scannable: true },
			{
				writeConcern: { w: 'majority' },
				readPreference: 'nearest'
			}
		)
	}
}
