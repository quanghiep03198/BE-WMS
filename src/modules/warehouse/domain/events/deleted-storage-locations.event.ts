export class DeletedStorageLocationsEvent {
	constructor(public readonly names: Array<string>) {}
}

export const DELETED_STORAGE_LOCATIONS_EVENT = 'storage-location.deleted'
