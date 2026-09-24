import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import { RmdbsWarehouseRepository } from '@modules/warehouse/infrastructure/persistence/mssql/repositories/rmdbs-warehouse.repository'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { WarehouseType } from '../../domain/constants'
import { CREATED_WAREHOUSE_EVENT, CreatedWarehouseEvent } from '../../domain/events/created-warehouse.event'

@EventListener(CREATED_WAREHOUSE_EVENT, { async: true })
export class CreatedWarehouseListener implements IEventListener<CreatedWarehouseEvent, void> {
	constructor(
		private readonly warehouseRepository: RmdbsWarehouseRepository,
		private readonly configService: ConfigService<ProcessEnv>,
		@InjectPinoLogger(CreatedWarehouseListener.name)
		private readonly logger: PinoLogger
	) {}

	public async handle(event: CreatedWarehouseEvent): Promise<void> {
		this.logger.info(`Handling CreatedWarehouseEvent for warehouse: ${event.warehouseName}`)

		const factory = this.configService.get<FactoryCode>('APP_TENANCY')

		await this.warehouseRepository.insertOne({
			code: factory + event.warehouseName,
			name: event.warehouseName,
			factory_code: factory,
			capacity: event.capacity,
			type_warehouse: WarehouseType.FINISHED_PRODUCTION_WAREHOUSE,
			user_code_created: event.createdBy,
			user_name_created: event.createdBy
		})
	}
}
