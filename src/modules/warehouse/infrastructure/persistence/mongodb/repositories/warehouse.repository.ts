import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { BaseMongoRepository } from '@modules/_base/repositories/base-mongo.abstract.repository'
import { UpdateWarehouseDTO } from '@modules/warehouse/application/dto/warehouse.dto'
import { IWarehouseRepository } from '@modules/warehouse/application/ports/warehouse.repository.port'
import { IWarehouse } from '@modules/warehouse/domain/interfaces/warehouse.interface'
import {
	Warehouse,
	WarehouseDocument,
	WarehouseModel
} from '@modules/warehouse/infrastructure/persistence/mongodb/schemas/warehouse.schema'
import { ConflictException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { padStart } from 'lodash'
import type { LeanDocument, Types } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'

@Injectable()
export class WarehouseRepository extends BaseMongoRepository<WarehouseDocument> implements IWarehouseRepository {
	constructor(
		@InjectModel(Warehouse.name, DATA_WAREHOUSE_CONNECTION) private readonly warehouseModel: WarehouseModel,
		private readonly i18nService: I18nService,
		private readonly configService: ConfigService<ProcessEnv>
	) {
		super(warehouseModel)
	}

	public override async findOneById(id: string): Promise<Nullable<LeanDocument<WarehouseDocument>>> {
		return await this.warehouseModel
			.findById(id)
			.populate({ path: 'storage_locations', populate: 'created_by updated_by' })
			.lean<Nullable<LeanDocument<WarehouseDocument>>>({ virtuals: true })
	}

	public override async createOne(
		payload: Partial<WarehouseDocument> | Partial<Omit<IWarehouse, '_id' | 'id'>>
	): Promise<WarehouseDocument> {
		const count = await this.warehouseModel.countDocuments()

		const nextCode = this.configService.get<FactoryCode>('APP_TENANCY') + 'PW' + padStart((count + 1).toString(), 3)

		const existedWarehouse = await this.warehouseModel.exists({ name: payload.name })
		if (existedWarehouse)
			throw new ConflictException(
				this.i18nService.t('warehouse.errors.warehouse_name_conflict', { lang: I18nContext.current()?.lang })
			)

		return await super.createOne({ ...payload, code: nextCode } as Partial<WarehouseDocument>)
	}

	public async findOneAndUpdate(
		id: Types.ObjectId,
		payload: UpdateWarehouseDTO
	): Promise<{ prev: IWarehouse; update: IWarehouse }> {
		const existed = await this.warehouseModel.findOne({ name: payload.name })
		if (existed && existed.name === payload.name && existed._id.toString() !== id.toString())
			throw new ConflictException(
				this.i18nService.t('warehouse.errors.warehouse_name_conflict', { lang: I18nContext.current()?.lang })
			)
		const prev = { ...existed.toObject<IWarehouse>() }
		const update = Object.assign(existed, payload)
		await update.save()
		return { prev, update }
	}

	public async getTotalCapacity(): Promise<{ total_capacity: number; total_storage_locations: number }> {
		const [result] = await this.warehouseModel.aggregate<{ total_capacity: number; total_storage_locations: number }>(
			[
				{
					$lookup: {
						from: 'storage_locations',
						localField: '_id',
						foreignField: 'warehouse',
						as: 'storage_locations'
					}
				},
				{
					$group: {
						_id: null,
						totalCapacity: { $sum: '$capacity' },
						totalStorageLocations: { $sum: { $size: '$storage_locations' } }
					}
				},
				{
					$project: {
						_id: 0,
						total_capacity: '$totalCapacity',
						total_storage_locations: '$totalStorageLocations'
					}
				}
			]
		)

		return result
	}

	public async deleteMany(ids: string[] | Types.ObjectId[]): Promise<string[]> {
		const pendingDeletedWarehouse = await this.warehouseModel.find({ _id: { $in: ids } })
		await super.deleteManyByIds(pendingDeletedWarehouse.map((w) => w._id))
		return pendingDeletedWarehouse.map((w) => w.name)
	}
}
