import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import {
	UPDATED_STORAGE_LOCATION_EVENT,
	UpdatedStorageLocationEvent
} from '@modules/warehouse/domain/events/updated-storage-location.event'
import { RmdbsStorageLocationRepository } from '../persistence/mssql/repositories/rmdbs-storage-location.repository'

@EventListener(UPDATED_STORAGE_LOCATION_EVENT, { async: true })
export class UpdatedStorageLocationListener implements IEventListener<UpdatedStorageLocationEvent, void> {
	constructor(private readonly rmdbsStorageLocationRepository: RmdbsStorageLocationRepository) {}

	public async handle(event: UpdatedStorageLocationEvent): Promise<void> {
		await this.rmdbsStorageLocationRepository.updateOneByName(event)
	}
}
