import { RFIDMatchCustomerEntity } from '../entities/rfid-customer-match.entity'

export type EpcInformation = Record<'color_sn', string> &
	Pick<RFIDMatchCustomerEntity, 'epc' | 'mo_no' | 'size_numcode' | 'shoes_style_code_factory'>

export type StoredRFIDReaderItem = EpcInformation & Record<'station_no' | 'factory_code_produce', string>

export type StoredRFIDReaderData = {
	epcs: Array<StoredRFIDReaderItem>
}

export type RFIDSearchParams = {
	page: number
	limit: number
	q?: string
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
	'mo_no' | 'mat_code' | 'shoes_style_code_factory' | 'size_numcode'
> & {
	count: number
}

export type UploadActions = 'inbound' | 'outbound'
