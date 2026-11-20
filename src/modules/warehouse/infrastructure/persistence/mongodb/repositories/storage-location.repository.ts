import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { BaseMongoRepository } from '@modules/_base/repositories/base-mongo.abstract.repository'
import {
	CreateBulkStorageLocationDTO,
	UpdateStorageLocationDTO
} from '@modules/warehouse/application/dto/storage-location.dto'
import { IStorageLocationRepository } from '@modules/warehouse/application/ports/storage-location.repository.port'
import { IStorageLocation } from '@modules/warehouse/domain/interfaces/storage-location.interface'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Types } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { StorageLocation, StorageLocationDocument, StorageLocationModel } from '../schemas/storage-location.schema'

@Injectable()
export class StorageLocationRepository
	extends BaseMongoRepository<StorageLocationDocument>
	implements IStorageLocationRepository
{
	constructor(
		@InjectModel(StorageLocation.name, DATA_WAREHOUSE_CONNECTION)
		private readonly storageLocationModel: StorageLocationModel,
		private readonly i18nService: I18nService
	) {
		super(storageLocationModel)
	}

	public async createMany(
		payload: CreateBulkStorageLocationDTO,
		createdBy: Types.ObjectId
	): Promise<IStorageLocation[]> {
		const existedLocations = await this.storageLocationModel
			.find({ warehouse: payload.warehouse, name: { $in: payload.locations.map((location) => location.name) } })
			.lean(true)
		if (existedLocations.length > 0)
			throw new ConflictException(
				this.i18nService.t('warehouse.errors.storage_location_conflict', {
					lang: I18nContext.current()?.lang
				})
			)
		const createdLocations = await super.insertMany(
			payload.locations.map<Partial<StorageLocationDocument>>((location) => ({
				warehouse: payload.warehouse,
				created_by: createdBy,
				name: location.name
			}))
		)
		return createdLocations.map((location) => location.toObject<IStorageLocation>())
	}

	public async findOneAndUpdate(
		id: Types.ObjectId,
		payload: UpdateStorageLocationDTO
	): Promise<{ prev: { name: string }; update: { name: string } }> {
		const origin = await super.findOneById(id)
		if (!origin) throw new NotFoundException('Storage location not found')
		const prev = { name: origin.name }
		const duplicated = await super.findOne({ _id: { $ne: id }, name: payload.name })
		if (duplicated)
			throw new ConflictException(
				this.i18nService.t('warehouse.errors.storage_location_conflict', {
					lang: I18nContext.current()?.lang
				})
			)
		Object.assign(origin, { ...origin, ...payload })
		await origin.save()
		return { prev, update: { name: payload.name } }
	}

	public async deleteMany(ids: Array<string> | Array<Types.ObjectId>): Promise<string[]> {
		const locations = await this.storageLocationModel
			.find({ _id: { $in: ids } })
			.select({ name: 1 })
			.lean()
		await this.storageLocationModel.deleteMany({ _id: { $in: ids } })
		return locations.map(({ name }) => name)
	}
}
