import { FactoryCodeRef } from '@common/constants/factory'
import { HttpService } from '@nestjs/axios'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { DECKERS_OAUTH2_STRATEGY } from '../constants'
import { OAuth2TokenResponse } from '../interfaces/third-party-api.interface'
import { IThirdPartyOAuth2Strategy } from '../interfaces/third-party-api.strategy.interface'

@Injectable()
export class DeckersOAuth2Strategy implements IThirdPartyOAuth2Strategy {
	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@Inject(DECKERS_OAUTH2_STRATEGY)
		private readonly deckersOauth2Strategy: Map<FactoryCodeRef, Record<'client_id' | 'client_secret', string>>,
		private readonly logger: PinoLogger,
		private readonly configService: ConfigService,
		private readonly httpService: HttpService
	) {}

	public async fetchOauth2Token(factoryCode: FactoryCodeRef): Promise<OAuth2TokenResponse> {
		try {
			const credentials = this.deckersOauth2Strategy.get(factoryCode)
			if (!credentials) throw new NotFoundException('Credential by factory could not be found')

			return await this.httpService.axiosRef.request<URLSearchParams, OAuth2TokenResponse>({
				baseURL: this.configService.get('DECKERS_OAUTH_API_URL'),
				url: '',
				method: 'POST',
				headers: {
					['Content-Type']: 'application/x-www-form-urlencoded'
				},
				data: new URLSearchParams({
					...credentials,
					grant_type: 'client_credentials',
					scope: 'event:publish'
				})
			})
		} catch (error) {
			this.logger.error(error)
			return null
		}
	}

	public async authenticate(factoryCode: FactoryCodeRef): Promise<string | null> {
		try {
			const accessToken = await this.getTokenByFactory(factoryCode)
			if (!accessToken) {
				const oauth2TokenResponse = await this.fetchOauth2Token(factoryCode)
				this.setTokenByFactory(factoryCode, oauth2TokenResponse.access_token, oauth2TokenResponse.expires_in)
				return oauth2TokenResponse.access_token
			}
			return accessToken
		} catch {
			return null
		}
	}

	public async setTokenByFactory(factoryCode: FactoryCodeRef, accessToken: string, expiresIn: number) {
		return await this.cacheManager.set(`third_party_token:${factoryCode}`, accessToken, expiresIn)
	}

	private async getTokenByFactory(factoryCode: FactoryCodeRef): Promise<string | null> {
		return await this.cacheManager.get<string | null>(`third_party_token:${factoryCode}`)
	}
}
