export type RFIDSearchParams = {
	page: number
	filter?: string
}

export type SearchCustOrderParams = {
	factoryCode: string
	orderTarget: string
	productionCode: string
	searchTerm: string
	sizeNumCode?: string
}
