import { DATA_WAREHOUSE_CONNECTION } from '@/databases/constants'
import {
	InventoryEpc,
	InventoryEpcDocument,
	InventoryEpcModel
} from '@/modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery } from 'mongoose'
import { DeleteScanningMoCommand } from './delete-scanning-mo.command'

@CommandHandler(DeleteScanningMoCommand)
export class DeleteScanningMoHandler implements ICommandHandler<DeleteScanningMoCommand> {
	constructor(
		@InjectModel(InventoryEpc.name, DATA_WAREHOUSE_CONNECTION) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async execute(command: DeleteScanningMoCommand): Promise<void> {
		const { stockFlow, manufacturingOrder, rescannable, deviceSerialNumber } = command

		const filterQuery: FilterQuery<InventoryEpcDocument> = {
			mo_no: manufacturingOrder
		}

		if (stockFlow === 'inbound' && deviceSerialNumber) {
			filterQuery.inbound_device_sn = { $eq: deviceSerialNumber }
			filterQuery.inbound_at = { $eq: null }
		}

		if (stockFlow === 'outbound') {
			filterQuery.outbound_at = { $eq: null }
		}

		await this.inventoryEpcModel
			.updateMany(filterQuery, { deleted: true, scannable: rescannable }, { overwriteImmutable: true })
			.exec()
	}
}
