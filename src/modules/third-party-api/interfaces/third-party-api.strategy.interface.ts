import { FactoryCodeRef } from '@common/constants/factory'
import { OAuth2TokenResponse } from './third-party-api.interface'

export interface IThirdPartyOAuth2Strategy {
	fetchOauth2Token(factoryCode: FactoryCodeRef): Promise<OAuth2TokenResponse>
	authenticate(factoryCode: FactoryCodeRef): Promise<string | null>
}
