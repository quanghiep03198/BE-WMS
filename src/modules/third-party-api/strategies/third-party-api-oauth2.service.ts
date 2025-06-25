import { FactoryCode } from '@/modules/department/constants'
import { HttpService } from '@nestjs/axios'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cache } from 'cache-manager'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { Logger } from 'winston'
import { OAuth2TokenResponse } from '../interfaces/third-party-api.interface'
import { GL1OAuth2Strategy, GL3OAuth2Strategy, GL4OAuth2Strategy } from './third-party-api-oauth2.strategy'

@Injectable()
export class ThirdPartyApiOAuth2Service {
	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
		private readonly configService: ConfigService,
		private readonly httpService: HttpService,
		private readonly gl1Credentials: GL1OAuth2Strategy,
		private readonly gl3Credentials: GL3OAuth2Strategy,
		private readonly gl4Credentials: GL4OAuth2Strategy
	) {}

	private getOAuth2CredentialFactory(factoryCode: string) {
		switch (factoryCode) {
			case FactoryCode.GL1:
				return this.gl1Credentials.getCredentials()
			case FactoryCode.GL3:
				return this.gl3Credentials.getCredentials()
			case FactoryCode.GL4:
				return this.gl4Credentials.getCredentials()
			default:
				throw new NotFoundException('Credential by factory could not be found')
		}
	}

	public async fetchOauth2Token(factoryCode: string): Promise<OAuth2TokenResponse> {
		try {
			const credentials = this.getOAuth2CredentialFactory(factoryCode)

			return await this.httpService.axiosRef.request<URLSearchParams, OAuth2TokenResponse>({
				baseURL: this.configService.get('THIRD_PARTY_OAUTH_API_URL'),
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

	public async authenticate(factoryCode: string) {
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

	private async setTokenByFactory(factoryCode: string, accessToken: string, expiresIn: number) {
		return await this.cacheManager.set(`third_party_token:${factoryCode}`, accessToken, expiresIn)
	}

	private async getTokenByFactory(factoryCode: string): Promise<string | null> {
		return await this.cacheManager.get<string | null>(`third_party_token:${factoryCode}`)
	}
}
