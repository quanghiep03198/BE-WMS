import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, Types } from 'mongoose'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { DefectiveGoodsWriteData, IDefectiveGoodsRepository } from '@modules/defective-goods/application/ports/defective-goods.repository.port'
import { DefectiveGoods, DefectiveGoodsDocument, DefectiveGoodsModel } from '../schemas/defective-goods.schema'

@Injectable()
export class DefectiveGoodsMongoRepository implements IDefectiveGoodsRepository {
	constructor(@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION) private readonly model: DefectiveGoodsModel) {}

	async createMany(items: DefectiveGoodsWriteData[]) {
		return (await this.model.create(items)) as DefectiveGoodsDocument[]
	}

	findById(id: string) {
		return this.model.findById(new Types.ObjectId(id)).exec()
	}

	findOne(filter: FilterQuery<DefectiveGoods>) {
		return this.model.findOne(filter).read('secondaryPreferred').exec()
	}

	findOneForWrite(filter: FilterQuery<DefectiveGoods>) {
		return this.model.findOne(filter).read('primary').exec()
	}

	async paginate(filter: FilterQuery<DefectiveGoods>, page: number, limit: number) {
		const result = await this.model.paginate(filter, {
			page,
			limit,
			read: { pref: 'secondaryPreferred' },
			sort: { created_at: -1 },
			customLabels: { docs: 'data' }
		})
		return result as unknown as Pagination<DefectiveGoodsDocument>
	}

	findManyForWrite(filter: FilterQuery<DefectiveGoods>) {
		return this.model.find(filter).read('primary').exec()
	}

	async updateById(id: string, data: DefectiveGoodsWriteData) {
		const _id = new Types.ObjectId(id)
		await this.model.findByIdAndUpdate(_id, { $set: data }, { new: true }).exec()
		return this.model.findById(_id).exec()
	}

	async softDeleteById(id: string) {
		const _id = new Types.ObjectId(id)
		await this.model.deleteOne({ _id }).exec()
		const deletedAt = new Date()
		await this.model.collection.updateOne({ _id }, { $set: { deleted_at: deletedAt } })
		return (await this.model.collection.findOne({ _id })) as DefectiveGoodsDocument | null
	}

	async softDeleteMany(filter: FilterQuery<DefectiveGoods>) {
		const documents = await this.model.find(filter).exec()
		if (!documents.length) return []
		const deletedAt = new Date()
		await this.model.deleteMany({ _id: { $in: documents.map(({ _id }) => _id) } }).exec()
		await this.model.collection.updateMany({ _id: { $in: documents.map(({ _id }) => _id) } }, { $set: { deleted_at: deletedAt } })
		return documents
	}
}
