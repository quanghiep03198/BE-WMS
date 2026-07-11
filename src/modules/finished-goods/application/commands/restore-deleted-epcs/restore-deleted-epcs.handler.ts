import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { RestoreDeletedEpcsCommand } from './restore-deleted-epcs.command'

@CommandHandler(RestoreDeletedEpcsCommand)
export class RestoreDeletedEpcsHandler implements ICommandHandler<RestoreDeletedEpcsCommand> {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute({ epcs }: RestoreDeletedEpcsCommand): Promise<void> {
		await this.finishedGoodsEpcModel.updateManyDeleted(
			{ epc: { $in: epcs } },
			{ deleted: false, scannable: true },
			{
				writeConcern: { w: 'majority' },
				readPreference: 'nearest'
			}
		)
	}
}
