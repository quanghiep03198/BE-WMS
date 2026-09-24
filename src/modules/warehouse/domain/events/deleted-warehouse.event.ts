export class DeletedWarehouseEvent {
	constructor(public readonly names: Array<string>) {}
}

export const DELETED_WAREHOUSE_EVENT = Symbol('warehouse.deleted')
