import { HttpService } from '@nestjs/axios'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { AxiosRequestConfig } from 'axios'
import { Cache } from 'cache-manager'
import { uniqBy } from 'lodash'
import { FactoryCode } from '../department/constants'
import { ThirdPartyApiEvent } from './constants'
import {
	FetchThirdPartyApiEvent,
	OAuth2Credentials,
	OAuth2TokenResponse,
	SyncEventData,
	SyncEventPayload,
	ThirdPartyApiResponseData
} from './third-party-api.interface'

@Injectable()
export class ThirdPartyApiService {
	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		private readonly httpService: HttpService,
		private readonly configService: ConfigService,
		private readonly eventEmitter: EventEmitter2
	) {}

	private getCredentialsByFactory(factoryCode: string): OAuth2Credentials {
		switch (factoryCode) {
			case FactoryCode.GL1:
				return {
					client_id: this.configService.get('GL1_CLIENT_ID'),
					client_secret: this.configService.get('GL1_CLIENT_SECRET')
				}
			case FactoryCode.GL3:
				return {
					client_id: this.configService.get('GL3_CLIENT_ID'),
					client_secret: this.configService.get('GL3_CLIENT_SECRET')
				}
			case FactoryCode.GL4:
				return {
					client_id: this.configService.get('GL4_CLIENT_ID'),
					client_secret: this.configService.get('GL4_CLIENT_SECRET')
				}
			default:
				throw new NotFoundException('Credential by factory could not be found')
		}
	}

	private setTokenByFactory(factoryCode: string, accessToken: string, expiresIn: number) {
		this.cacheManager.set(`third_party_token:${factoryCode}`, accessToken, expiresIn)
	}

	public async getTokenByFactory(factoryCode: string): Promise<string | null> {
		return await this.cacheManager.get(`third_party_token:${factoryCode}`)
	}

	private async authenticate(factoryCode: string): Promise<boolean> {
		try {
			const accessToken = await this.cacheManager.get(`third_party_token:${factoryCode}`)
			if (!accessToken) {
				const oauth2TokenResponse = await this.fetchOauth2Token(factoryCode)
				this.setTokenByFactory(factoryCode, oauth2TokenResponse.access_token, oauth2TokenResponse.expires_in)
			}
			return true
		} catch {
			await this.cacheManager.del(`sync_process:${factoryCode}`)
			return false
		}
	}

	public async fetchOauth2Token(factoryCode: string): Promise<OAuth2TokenResponse> {
		try {
			const credentials = this.getCredentialsByFactory(factoryCode)
			return await this.httpService.axiosRef.request<URLSearchParams, OAuth2TokenResponse>({
				baseURL: this.configService.get('THIRD_PARTY_OAUTH_API_URL'),
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
			Logger.error(error.message)
		}
	}

	private async getCustomerEpcData({
		headers,
		param
	}: {
		headers: AxiosRequestConfig['headers']
		param: string
	}): Promise<ThirdPartyApiResponseData> {
		try {
			return await this.httpService.axiosRef.get<void, ThirdPartyApiResponseData>(`/epc/${param}`, {
				method: 'GET',
				headers: {
					['Content-Type']: 'application/json',
					...headers
				}
			})
		} catch (error) {
			console.log(error.message)
		}
	}

	@OnEvent(ThirdPartyApiEvent.DISPATCH)
	protected async pullCustomerDataByFactory(e: FetchThirdPartyApiEvent) {
		await this.authenticate(e.params.factoryCode)

		const data = await Promise.all(
			e.data.map(async (item) => {
				return await this.getCustomerEpcData({
					headers: {
						['X-Factory']: e.params.factoryCode
					},
					param: item
				})
			})
		)

		const eventData: Array<SyncEventData> = uniqBy(data, (item) => item.epc.slice(0, 22)).map((item) => ({
			epc: item.epc,
			mo_no: item.commandNumber,
			size_numcode: item.sizeNumber
		}))

		this.eventEmitter.emit(ThirdPartyApiEvent.SUCCESS, {
			data: eventData,
			params: e.params
		} satisfies SyncEventPayload)
	}
}
