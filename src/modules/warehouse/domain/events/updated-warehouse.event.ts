export class UpdatedWarehouseEvent {
	constructor(
		public readonly prev: { name: string; capacity: number },
		public readonly update: { name: string; capacity: number; updated_by: string }
	) {}
}

export const UPDATED_WAREHOUSE_EVENT = 'warehouse.updated'
