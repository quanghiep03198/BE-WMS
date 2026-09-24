import { HttpMethod, RequireAuthorized, RouteHandler, User } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { Body, Controller, HttpStatus, Inject, Param } from '@nestjs/common'
import { ParseObjectIdPipe } from '@nestjs/mongoose'
import type { Types } from 'mongoose'

import { UserRole } from '@modules/user/domain/constants'
import {
	IStorageLocationRepository,
	STORAGE_LOCATION_REPOSITORY
} from '@modules/warehouse/application/ports/storage-location.repository.port'
import {
	IWarehouseRepository,
	WAREHOUSE_REPOSITORY
} from '@modules/warehouse/application/ports/warehouse.repository.port'
import {
	CREATED_STORAGE_LOCATIONS,
	CreatedStorageLocationsEvent
} from '@modules/warehouse/domain/events/created-storage-locations.event'
import {
	DELETED_STORAGE_LOCATIONS_EVENT,
	DeletedStorageLocationsEvent
} from '@modules/warehouse/domain/events/deleted-storage-locations.event'
import {
	UPDATED_STORAGE_LOCATION_EVENT,
	UpdatedStorageLocationEvent
} from '@modules/warehouse/domain/events/updated-storage-location.event'
import { EventEmitter2 } from '@nestjs/event-emitter'
import {
	CreateBulkStorageLocationDTO,
	createBulkStorageLocationValidator,
	DeleteStorageLocationDTO,
	deleteStorageLocationValidator,
	UpdateStorageLocationDTO,
	updateStorageLocationValidator
} from '../../application/dto/storage-location.dto'

@Controller('storage-location')
export class StorageLocationController {
	constructor(
		@Inject(STORAGE_LOCATION_REPOSITORY)
		private readonly storageLocationService: IStorageLocationRepository,
		@Inject(WAREHOUSE_REPOSITORY)
		private readonly warehouseRepository: IWarehouseRepository,
		private readonly eventEmitter: EventEmitter2
	) {}

	@RouteHandler({
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.created' }
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async createStorageLocation(
		@Body(new ZodValidationPipe(createBulkStorageLocationValidator)) payload: CreateBulkStorageLocationDTO,
		@User('_id', ParseObjectIdPipe) userId: Types.ObjectId,
		@User('username') username: string
	) {
		const warehouse = await this.warehouseRepository.findOneById(payload.warehouse)
		await this.storageLocationService.createMany(payload, userId)
		this.eventEmitter.emit(
			CREATED_STORAGE_LOCATIONS,
			new CreatedStorageLocationsEvent(payload.locations, warehouse.name, username)
		)
	}

	@RouteHandler({
		endpoint: ':id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async updateStorageLocation(
		@Param('id', ParseObjectIdPipe) id: Types.ObjectId,
		@Body(new ZodValidationPipe(updateStorageLocationValidator)) payload: UpdateStorageLocationDTO,
		@User('_id', ParseObjectIdPipe) userId: Types.ObjectId,
		@User('username') username: string
	) {
		const result = await this.storageLocationService.findOneAndUpdate(id, { ...payload, updated_by: userId })
		this.eventEmitter.emit(
			UPDATED_STORAGE_LOCATION_EVENT,
			new UpdatedStorageLocationEvent(result.prev, { ...result.update, updated_by: username })
		)

		return result
	}

	@RouteHandler({
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	async deleteStorageLocation(
		@Body(new ZodValidationPipe(deleteStorageLocationValidator)) payload: DeleteStorageLocationDTO
	) {
		const deletedNames = await this.storageLocationService.deleteMany(payload.ids)
		this.eventEmitter.emit(DELETED_STORAGE_LOCATIONS_EVENT, new DeletedStorageLocationsEvent(deletedNames))
	}
}
