import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { EpcChangeStreamFilterQuery, IEpcChangeStream } from '@modules/finished-goods/domain/interfaces'
import { IEpcChangeStreamFactory } from '@modules/finished-goods/domain/interfaces/epc-change-stream.factory.interface'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { mongo } from 'mongoose'
import { EpcChangeStreamWrapper } from './epc-change-stream.wrapper'
import { FinishedGoodsEpc, FinishedGoodsEpcDocument, FinishedGoodsEpcModel } from './schemas/finished-goods-epc.schema'

// infrastructure/persistence/mongodb/epc-change-stream.factory.ts
@Injectable()
export class MongoEpcChangeStreamFactory implements IEpcChangeStreamFactory {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	async create(
		filterQuery: EpcChangeStreamFilterQuery,
		onChange: () => void | Promise<void>
	): Promise<IEpcChangeStream> {
		const changeStream = this.finishedGoodsEpcModel.watch<
			FinishedGoodsEpcDocument,
			mongo.ChangeStreamDocument<FinishedGoodsEpcDocument>
		>(
			[
				{
					$match: {
						$or: [{ operationType: { $in: ['insert', 'update'] }, ...filterQuery }, { operationType: 'delete' }]
					}
				}
			],
			{ fullDocument: 'updateLookup', readPreference: 'nearest' }
		)

		const wrapper = new EpcChangeStreamWrapper(changeStream) // Wrapper cũng chuyển xuống đây luôn
		wrapper.onChange(onChange)
		return wrapper
	}
}
