import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcDocument,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { throttle } from 'lodash'
import { mongo } from 'mongoose'
import { CreateEpcChangeStreamCommand } from './create-epc-change-stream.command'

@CommandHandler(CreateEpcChangeStreamCommand)
export class CreateEpcChangeStreamHandler implements ICommandHandler<
	CreateEpcChangeStreamCommand,
	mongo.ChangeStream<FinishedGoodsEpcDocument, mongo.ChangeStreamDocument<FinishedGoodsEpcDocument>>
> {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute({ filterQuery, onChange }: CreateEpcChangeStreamCommand) {
		const changeStream = this.finishedGoodsEpcModel.watch<
			FinishedGoodsEpcDocument,
			mongo.ChangeStreamDocument<FinishedGoodsEpcDocument>
		>(
			[
				{
					$match: {
						$or: [
							{
								operationType: { $in: ['insert', 'update'] },
								...filterQuery
							},
							{
								operationType: 'delete'
							}
						]
					}
				}
			],
			{
				fullDocument: 'updateLookup',
				readPreference: 'nearest'
			}
		)

		changeStream.on(
			'change',
			throttle((change: mongo.ChangeStreamDocument<FinishedGoodsEpcDocument>) => onChange(change), 500, {
				leading: true,
				trailing: true
			})
		)

		return changeStream
	}
}
