import { PluralI18nPath } from '@/common/decorators'
import { I18nPath } from '@/generated/i18n.generated'

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

export interface SyncProcessState {
	id: number
	name: string | PluralI18nPath | I18nPath
	status: 'processing' | 'waiting' | 'completed' | 'failed' | 'cancelled'
}
