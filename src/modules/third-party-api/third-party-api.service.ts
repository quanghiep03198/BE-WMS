import { HttpService } from '@nestjs/axios'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { AxiosRequestConfig } from 'axios'
import { Cache } from 'cache-manager'
import { writeFileSync } from 'fs'
import { isEmpty, isNil, uniqBy } from 'lodash'
import { join } from 'path'
import { FactoryCode } from '../department/constants'
import { ThirdPartyApiEvent } from './constants'
import {
	FetchThirdPartyApiEvent,
	OAuth2Credentials,
	OAuth2TokenResponse,
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
				headers: {
					['Content-Type']: 'application/json',
					...headers
				}
			})
		} catch (error) {
			console.log(error.message)
		}
	}

	private async getCustmerEpcByCmdNo(commandNumber) {
		return await this.httpService.axiosRef.get<void, ThirdPartyApiResponseData[]>('/epcs', {
			params: {
				commandNumber
			}
		})
	}

	private getFileToStoreData(factoryCode: string) {
		return `[${factoryCode}]-decker-api.data.json`
	}

	@OnEvent(ThirdPartyApiEvent.DISPATCH)
	protected async pullCustomerDataByFactory(e: FetchThirdPartyApiEvent) {
		await this.authenticate(e.params.factoryCode)

		const expectedCommandData = await Promise.all(
			e.data.map(async (item) => {
				return await this.getCustomerEpcData({
					headers: {
						['X-Factory']: e.params.factoryCode
					},
					param: item
				})
			})
		)

		Logger.debug(expectedCommandData)

		if (expectedCommandData.every((item) => isNil(item) || isEmpty(item))) {
			await this.cacheManager.del(`sync_process:${e.params.factoryCode}`)
			return
		}

		const epcsByFetchedCommandData = uniqBy(
			expectedCommandData.filter((item) => !isNil(item) || isEmpty(item)),
			'commandNumber'
		)
			.map(async (item) => await this.getCustmerEpcByCmdNo(item.commandNumber))
			.flat()

		// TODO: temporarily save fetched data from customer to file
		const storeDataFileName = this.getFileToStoreData(e.params.factoryCode)
		writeFileSync(
			join(__dirname, '../..', `/assets/data/${storeDataFileName}`),
			JSON.stringify(epcsByFetchedCommandData)
		)

		this.eventEmitter.emit(ThirdPartyApiEvent.FULFILL, {
			data: { storeDataFileName },
			params: e.params
		} satisfies SyncEventPayload)
	}
}
