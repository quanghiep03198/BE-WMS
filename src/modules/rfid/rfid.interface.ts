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

interface BaseFetchPMDataArgs {
	'factory_code.eq': string
	'producing_process.eq': string
}

export interface FetchLatestPMDataArgs extends BaseFetchPMDataArgs {
	page: number
	'mo_no.eq'?: string
}
