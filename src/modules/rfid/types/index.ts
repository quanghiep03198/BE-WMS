import { RFIDMatchCustomerEntity } from '../entities/rfid-customer-match.entity'

export type RFIDSearchParams = {
	page: number
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
