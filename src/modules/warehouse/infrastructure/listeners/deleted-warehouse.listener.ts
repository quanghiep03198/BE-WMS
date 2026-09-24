import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import {
	DELETED_WAREHOUSE_EVENT,
	DeletedWarehouseEvent
} from '@modules/warehouse/domain/events/deleted-warehouse.event'
import { RmdbsWarehouseRepository } from '../persistence/mssql/repositories/rmdbs-warehouse.repository'

@EventListener(DELETED_WAREHOUSE_EVENT, { async: true })
export class DeletedWarehouseListener implements IEventListener<DeletedWarehouseEvent, void> {
	constructor(private readonly rmdbsWarehouseRepository: RmdbsWarehouseRepository) {}

	public async handle({ names }: DeletedWarehouseEvent): Promise<void> {
		await this.rmdbsWarehouseRepository.deleteManyByNames(names)
	}
}
