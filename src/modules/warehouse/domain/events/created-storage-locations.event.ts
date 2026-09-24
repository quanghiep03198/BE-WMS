export class CreatedStorageLocationsEvent {
	constructor(
		public readonly locations: Array<{ name: string }>,
		public readonly warehouseName: string,
		public readonly createdBy: string
	) {}
}

export const CREATED_STORAGE_LOCATIONS = 'created.storage.location'
