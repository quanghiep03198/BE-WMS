import { RFIDMatchEntity } from '../persistence/mssql/rfid-match.entity'

export type EpcInformation = Pick<RFIDMatchEntity, 'epc' | 'mo_no' | 'size_numcode' | 'factory_shoes_style'> & {
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

export type UploadActions = 'inbound' | 'outbound'
