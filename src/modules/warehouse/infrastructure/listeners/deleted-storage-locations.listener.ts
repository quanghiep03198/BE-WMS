import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import {
	DELETED_STORAGE_LOCATIONS_EVENT,
	DeletedStorageLocationsEvent
} from '@modules/warehouse/domain/events/deleted-storage-locations.event'
import { RmdbsStorageLocationRepository } from '../persistence/mssql/repositories/rmdbs-storage-location.repository'

@EventListener(DELETED_STORAGE_LOCATIONS_EVENT, { async: true })
export class DeletedStorageLocationsListener implements IEventListener<DeletedStorageLocationsEvent, void> {
	constructor(private readonly rmdbsStorageLocationRepository: RmdbsStorageLocationRepository) {}

	public async handle({ names }: DeletedStorageLocationsEvent): Promise<void> {
		await this.rmdbsStorageLocationRepository.deleteManyByNames(names)
	}
}