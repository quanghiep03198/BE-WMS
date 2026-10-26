import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IDefectiveGoodsRepository } from '@modules/defective-goods/application/ports/defective-goods.repository.port'
import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, Types, isValidObjectId } from 'mongoose'
import { DefectiveGoods, DefectiveGoodsDocument, DefectiveGoodsModel } from '../schemas/defective-goods.schema'

@Injectable()
export class DefectiveGoodsMongoRepository implements IDefectiveGoodsRepository {
	constructor(
		@InjectModel(DefectiveGoods.name, DATA_WAREHOUSE_CONNECTION)
		private readonly defectiveGoodsModel: DefectiveGoodsModel
	) {}

	async createMany(items: IDefectiveGoods[]) {
		return (await this.defectiveGoodsModel.create(
			items.map((item) => ({
				...item,
				...(isValidObjectId(new Types.ObjectId(String(item.assembly_line)))
					? { assembly_line: new Types.ObjectId(String(item.assembly_line)) }
					: {}),
				...(isValidObjectId(new Types.ObjectId(String(item.sewing_line)))
					? { sewing_line: new Types.ObjectId(String(item.sewing_line)) }
					: {})
			}))
		)) as DefectiveGoodsDocument[]
	}

	findById(id: string) {
		return this.defectiveGoodsModel.findById(new Types.ObjectId(id)).exec()
	}

	findOne(filter: FilterQuery<DefectiveGoods>) {
		return this.defectiveGoodsModel.findOne(filter).read('secondaryPreferred').exec()
	}

	findOneForWrite(filter: FilterQuery<DefectiveGoods>) {
		return this.defectiveGoodsModel.findOne(filter).read('primary').exec()
	}

	async paginate(filter: FilterQuery<DefectiveGoods>, page: number, limit: number) {
		const result = await this.defectiveGoodsModel.paginate(filter, {
			page,
			limit,
			read: { pref: 'secondaryPreferred' },
			sort: { created_at: -1 },
			customLabels: { docs: 'data' }
		})
		return result as unknown as Pagination<DefectiveGoodsDocument>
	}

	findManyForWrite(filter: FilterQuery<DefectiveGoods>) {
		return this.defectiveGoodsModel.find(filter).read('primary').exec()
	}

	async updateById(id: string, data: IDefectiveGoods) {
		const _id = new Types.ObjectId(id)
		await this.defectiveGoodsModel.findByIdAndUpdate(_id, { $set: data }, { new: true }).exec()
		return this.defectiveGoodsModel.findById(_id).exec()
	}

	async softDeleteById(id: string) {
		const _id = new Types.ObjectId(id)
		await this.defectiveGoodsModel.deleteOne({ _id }).exec()
		const deletedAt = new Date()
		await this.defectiveGoodsModel.collection.updateOne({ _id }, { $set: { deleted_at: deletedAt } })
		return (await this.defectiveGoodsModel.collection.findOne({ _id })) as DefectiveGoodsDocument | null
	}

	async softDeleteMany(filter: FilterQuery<DefectiveGoods>) {
		const documents = await this.defectiveGoodsModel.find(filter).exec()
		if (!documents.length) return []
		const deletedAt = new Date()
		await this.defectiveGoodsModel.deleteMany({ _id: { $in: documents.map(({ _id }) => _id) } }).exec()
		await this.defectiveGoodsModel.collection.updateMany(
			{ _id: { $in: documents.map(({ _id }) => _id) } },
			{ $set: { deleted_at: deletedAt } }
		)
		return documents
	}
}
