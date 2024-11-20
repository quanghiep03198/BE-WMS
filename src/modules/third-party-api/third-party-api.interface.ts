import { RFIDCustomerEntity } from '../rfid/entities/rfid-customer.entity'

export interface OAuth2Credentials {
	client_id: string
	client_secret: string
}

export interface OAuth2TokenResponse {
	access_token: string
	token_type: 'Bearer' & string
	scope: 'event:publish' & string
	expires_in: number
}

export interface ThirdPartyApiResponseData {
	epc: string
	po: string
	styleNumber: string
	colorCode: string
	shipId: string
	factoryCode: string
	sizeNumber: string
	upc: string
	factoryWorkOrder: string
	batchNumber: string
	commandNumber: string
	updated: Date
}

export interface FetchThirdPartyApiEvent {
	params: {
		tenantId: string
		factoryCode: string
	}
	data: Array<string>
}

export type SyncEventData = Pick<RFIDCustomerEntity, 'epc' | 'mo_no' | 'size_numcode'>

export interface SyncEventPayload extends Pick<FetchThirdPartyApiEvent, 'params'> {
	data: {
		storeDataFileName
	}
}
