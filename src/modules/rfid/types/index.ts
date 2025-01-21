import { RFIDMatchCustomerEntity } from '../entities/rfid-customer-match.entity'

export type StoredRFIDReaderItem = Record<'epc' | 'mo_no' | 'station_no' | 'record_time', string>

export type StoredRFIDReaderData = {
	epcs: Array<StoredRFIDReaderItem>
}

export type RFIDSearchParams = {
	_page: number
	_limit: number
	'mo_no.eq'?: string
}
export type SearchCustOrderParams = {
	'mo_no.eq': string
	'mat_code.eq': string
	'size_num_code.eq'?: string
	'factory_code.eq': string
	q: string
}

export type UpsertRFIDCustomerData = {
	commandNumber: string
	items: Partial<RFIDMatchCustomerEntity>[]
}

export type DeleteEpcBySizeParams = Pick<SearchCustOrderParams, 'mo_no.eq' | 'size_num_code.eq'> & {
	'quantity.eq': number
}
