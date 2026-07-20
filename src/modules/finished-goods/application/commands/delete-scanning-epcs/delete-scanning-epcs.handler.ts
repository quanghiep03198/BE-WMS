import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { DeleteScanningEpcsCommand } from './delete-scanning-epcs.command'

@CommandHandler(DeleteScanningEpcsCommand)
export class DeleteScanningEpcsHandler implements ICommandHandler<DeleteScanningEpcsCommand> {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute({ pendingDeleteEpcs, rescannable }: DeleteScanningEpcsCommand) {
		await this.finishedGoodsEpcModel
			.updateMany({ epc: { $in: pendingDeleteEpcs } }, { deleted: true, scannable: rescannable })
			.exec()
	}
}
