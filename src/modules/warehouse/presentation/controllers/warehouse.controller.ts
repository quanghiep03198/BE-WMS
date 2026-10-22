import { HttpMethod, RequestUser, RequireAuthorized, RouteHandler } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { UserRole } from '@modules/user/domain/constants'
import {
	IWarehouseRepository,
	WAREHOUSE_REPOSITORY
} from '@modules/warehouse/application/ports/warehouse.repository.port'
import {
	CREATED_WAREHOUSE_EVENT,
	CreatedWarehouseEvent
} from '@modules/warehouse/domain/events/created-warehouse.event'
import {
	DELETED_WAREHOUSE_EVENT,
	DeletedWarehouseEvent
} from '@modules/warehouse/domain/events/deleted-warehouse.event'
import {
	UPDATED_WAREHOUSE_EVENT,
	UpdatedWarehouseEvent
} from '@modules/warehouse/domain/events/updated-warehouse.event'
import { Body, Controller, HttpStatus, Inject, Param } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { ParseObjectIdPipe } from '@nestjs/mongoose'
import { Types } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import {
	CreateWarehouseDTO,
	createWarehouseValidator,
	DeleteWarehouseDTO,
	deleteWarehouseValidator,
	UpdateWarehouseDTO,
	updateWarehouseValidator
} from '../../application/dto/warehouse.dto'

@Controller('warehouse')
export class WarehouseController {
	constructor(
		@Inject(WAREHOUSE_REPOSITORY)
		private readonly warehouseRepository: IWarehouseRepository,
		@InjectPinoLogger(WarehouseController.name)
		private readonly logger: PinoLogger,
		private readonly eventEmitter: EventEmitter2
	) {}

	@RouteHandler({ method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getAll() {
		return await this.warehouseRepository.findAll()
	}

	@RouteHandler({
		endpoint: ':id',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getOneByName(@Param('id') id: string) {
		return await this.warehouseRepository.findOneById(id)
	}

	@RouteHandler({
		endpoint: 'summary',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getTotalCapacity() {
		return await this.warehouseRepository.getTotalCapacity()
	}

	@RouteHandler({
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.created' }
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async createWarehouse(
		@Body(new ZodValidationPipe(createWarehouseValidator)) payload: CreateWarehouseDTO,
		@RequestUser('_id') userId: Types.ObjectId,
		@RequestUser('username') username: string
	) {
		const createdWarehouse = await this.warehouseRepository.createOne({ ...payload, created_by: userId })
		this.eventEmitter.emit(
			CREATED_WAREHOUSE_EVENT,
			new CreatedWarehouseEvent(payload.name, payload.capacity, username)
		)

		return createdWarehouse
	}

	@RouteHandler({
		endpoint: ':id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async updateWarehouse(
		@Param('id', ParseObjectIdPipe) id: Types.ObjectId,
		@Body(new ZodValidationPipe(updateWarehouseValidator)) payload: UpdateWarehouseDTO,
		@RequestUser('_id') userId: Types.ObjectId,
		@RequestUser('username') username: string
	) {
		const { prev, update: updated } = await this.warehouseRepository.findOneAndUpdate(id, {
			...payload,
			updated_by: userId
		})
		this.eventEmitter.emit(
			UPDATED_WAREHOUSE_EVENT,
			new UpdatedWarehouseEvent(
				{ name: prev.name, capacity: prev.capacity },
				{ name: payload.name, capacity: payload.capacity ?? updated.capacity, updated_by: username }
			)
		)
	}

	@RouteHandler({
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	@RequireAuthorized(UserRole.MANAGER)
	async deleteWarehouses(@Body(new ZodValidationPipe(deleteWarehouseValidator)) payload: DeleteWarehouseDTO) {
		const deletedWarehouses = await this.warehouseRepository.deleteMany(payload.ids)
		this.eventEmitter.emit(DELETED_WAREHOUSE_EVENT, new DeletedWarehouseEvent(deletedWarehouses))
	}
}
