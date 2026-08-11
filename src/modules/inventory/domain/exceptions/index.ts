export class InventoryAuditBlockedException extends Error {
	constructor(public readonly reason: 'time_not_elapsed' | 'already_checkout') {
		super(reason)
	}
}
