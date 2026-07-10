import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	InventoryEpc,
	InventoryEpcDocument,
	InventoryEpcModel
} from '@modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { throttle } from 'lodash'
import { mongo } from 'mongoose'
import { CreateEpcChangeStreamCommand } from './create-epc-change-stream.command'

@CommandHandler(CreateEpcChangeStreamCommand)
export class CreateEpcChangeStreamHandler implements ICommandHandler<
	CreateEpcChangeStreamCommand,
	mongo.ChangeStream<InventoryEpcDocument, mongo.ChangeStreamDocument<InventoryEpcDocument>>
> {
	constructor(
		@InjectModel(InventoryEpc.name, DATA_WAREHOUSE_CONNECTION) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async execute({ filterQuery, onChange }: CreateEpcChangeStreamCommand) {
		const changeStream = this.inventoryEpcModel.watch<
			InventoryEpcDocument,
			mongo.ChangeStreamDocument<InventoryEpcDocument>
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
			throttle((change: mongo.ChangeStreamDocument<InventoryEpcDocument>) => onChange(change), 500, {
				leading: true,
				trailing: true
			})
		)

		return changeStream
	}
}
