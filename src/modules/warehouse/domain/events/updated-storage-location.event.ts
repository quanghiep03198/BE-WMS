export class UpdatedStorageLocationEvent {
	constructor(
		public readonly prev: { name: string },
		public readonly update: { name: string; updated_by: string }
	) {}
}

export const UPDATED_STORAGE_LOCATION_EVENT = 'storage-location.updated'
