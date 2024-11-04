export enum InventoryActions {
	INBOUND = 'A',
	OUTBOUND = 'B'
}

export enum InventoryStorageType {
	NORMAL_IMPORT = 'A',
	NORMAL_EXPORT = 'B',
	SCRAP = 'C',
	TRANSFER_INBOUND = 'D',
	TRANSFER_OUTBOUND = 'E',
	RECYCLING = 'F'
}

export enum ProducingProcess {
	HALF_FINISHED = 'IH',
	CUTTING = 'FC'
}

export const EXCLUDED_ORDERS: Array<string> = ['13D05B006']
export const EXCLUDED_EPC_PATTERN: string = '303429%'
export const INTERNAL_EPC_PATTERN: string = 'E28%'
export const FALLBACK_VALUE: string = 'Unknown'
export const MATCH_EPC_CHAR_LEN = 22
