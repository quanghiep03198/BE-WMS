export class CreatedWarehouseEvent {
	private static readonly __namespace = 'warehouse'
	private static readonly __event = 'created'

	constructor(
		public readonly warehouseName: string,
		public readonly capacity: number,
		public readonly createdBy: string
	) {}

	static get event(): string | symbol {
		return Symbol(this.__namespace + '.' + this.__event)
	}
}

export const CREATED_WAREHOUSE_EVENT = Symbol('warehouse.created')
