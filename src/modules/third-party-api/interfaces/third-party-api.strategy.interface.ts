import { FactoryCode } from '@modules/department/constants'
import { OAuth2TokenResponse } from './third-party-api.interface'

export interface IThirdPartyOAuth2Strategy {
	fetchOauth2Token(factoryCode: FactoryCode): Promise<OAuth2TokenResponse>
	authenticate(factoryCode: FactoryCode): Promise<string | null>
}
