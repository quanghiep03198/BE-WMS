export enum InventoryActions {
	INBOUND = 'A',
	OUTBOUND = 'B'
}

export enum InventoryStorageType {
	NORMAL_IMPORT = 'A',
	NORMAL_EXPORT = 'B',
	RECYCLING = 'C',
	SCRAP = 'F'
}

export enum ProducingProcessSuffix {
	HALF_FINISHED = 'IH',
	CUTTING = 'FC',
	SHAPING = 'DH'
}

export const EXCLUDED_ORDERS: Array<string> = ['13D05B006', '13A08C003']
export const EXCLUDED_EPC_PATTERN: string = '303429%'
export const EXCLUDED_EPC_PREFIX: string = '303429'
export const INTERNAL_EPC_PREFIX: string = 'E28'
export const FALLBACK_VALUE: string = 'Unknown'
export const MATCH_EPC_CHAR_LEN = 22

// export const POST_DATA_INBOUND_QUEUE = 'POST_DATA_INBOUND_QUEUE'
// export const POST_DATA_OUTBOUND_QUEUE = 'POST_DATA_OUTBOUND_QUEUE'
// export const IMPORT_DATA_QUEUE = 'IMPORT_DATA_QUEUE'
