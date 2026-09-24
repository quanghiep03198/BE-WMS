import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import { UPDATED_WAREHOUSE_EVENT, UpdatedWarehouseEvent } from '../../domain/events/updated-warehouse.event'
import { RmdbsWarehouseRepository } from '../persistence/mssql/repositories/rmdbs-warehouse.repository'

@EventListener(UPDATED_WAREHOUSE_EVENT, { async: true })
export class UpdatedWarehouseListener implements IEventListener<UpdatedWarehouseEvent, void> {
	constructor(private readonly rmdbsWarehouseRepository: RmdbsWarehouseRepository) {}

	public async handle(event: UpdatedWarehouseEvent): Promise<void> {
		await this.rmdbsWarehouseRepository.updateOneByName(event)
	}
}
