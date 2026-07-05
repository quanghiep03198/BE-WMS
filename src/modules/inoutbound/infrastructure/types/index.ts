export type EpcInformation = {
	epc: string
	mo_no: string
	size_numcode: string
	factory_shoes_style: string
	color_sn: string
	scanned?: boolean
	stored_at?: null | Date | string
}

export type StoredRFIDReaderItem = EpcInformation & Record<'station_no' | 'factory_code_produce', string>

export type RFIDSearchParams = {
	page: number
	limit: number
	q?: string
	'inbound_device_sn.eq'?: string
	'outbound_device_sn.eq'?: string
	'mo_no.eq'?: string
	'shoes_style.eq'?: string
	'color_sn.eq'?: string
	'size_numcode.eq'?: string
}
