import { RFIDMatchCustomerEntity } from '../persistence/mssql/rfid-customer-match.entity'
import { RFIDReaderEntity } from '../persistence/mssql/rfid-reader.entity'

export type EpcInformation = Pick<RFIDMatchCustomerEntity, 'epc' | 'mo_no' | 'size_numcode' | 'factory_shoes_style'> & {
	color_sn: string
	scanned?: boolean
	stored_at?: null | Date | string
}

export type StoredRFIDReaderItem = EpcInformation & Record<'station_no' | 'factory_code_produce', string>

export type StoredRFIDReaderData = {
	epcs: Array<StoredRFIDReaderItem>
}

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

export type SearchCustOrderParams = {
	'mo_no.eq': string
	'mat_code.eq': string
	'size_numcode.eq'?: string
	'factory_code.eq': string
	q: string
}

export type UpsertRFIDCustomerData = {
	commandNumber: string
	items: Partial<RFIDMatchCustomerEntity>[]
}

export type CustomerOrderSizeDetail = Pick<
	RFIDMatchCustomerEntity,
	'mo_no' | 'mat_code' | 'factory_shoes_style' | 'size_numcode'
> & {
	count: number
}

export type UploadActions = 'inbound' | 'outbound'

export type ScannedOrderDetail = {
	mo_no
	color_sn
	factory_shoes_style
	sizes: Array<{ size_numcode: string; count: number }>
}

export type ExtendedRFIDReaderEntity = RFIDReaderEntity & { last_used_time: string | null }
