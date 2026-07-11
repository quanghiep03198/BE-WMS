import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcDocument,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery } from 'mongoose'
import { DeleteScanningMoCommand } from './delete-scanning-mo.command'

@CommandHandler(DeleteScanningMoCommand)
export class DeleteScanningMoHandler implements ICommandHandler<DeleteScanningMoCommand> {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute(command: DeleteScanningMoCommand): Promise<void> {
		const { stockFlow, manufacturingOrder, rescannable, deviceSerialNumber } = command

		const filterQuery: FilterQuery<FinishedGoodsEpcDocument> = {
			mo_no: manufacturingOrder
		}

		if (stockFlow === 'inbound' && deviceSerialNumber) {
			filterQuery.inbound_device_sn = { $eq: deviceSerialNumber }
			filterQuery.inbound_at = { $eq: null }
		}

		if (stockFlow === 'outbound') {
			filterQuery.outbound_at = { $eq: null }
		}

		await this.finishedGoodsEpcModel
			.updateMany(filterQuery, { deleted: true, scannable: rescannable }, { overwriteImmutable: true })
			.exec()
	}
}
