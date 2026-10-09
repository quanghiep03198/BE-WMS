/** Reconciles the MSSQL rows of a dispatch order with its MongoDB document (source of truth). */
export class SyncDispatchOrderToMssqlCommand {
	constructor(public readonly dispatchOrder: string) {}
}
