import { FileLogger } from '@/common/helpers/file-logger.helper'
import { HttpService } from '@nestjs/axios'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { AxiosRequestConfig } from 'axios'
import { Cache } from 'cache-manager'
import { writeFileSync } from 'fs'
import { uniqBy } from 'lodash'
import { join, resolve } from 'path'
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

	async setTokenByFactory(factoryCode: string, accessToken: string, expiresIn: number) {
		return await this.cacheManager.set(`third_party_token:${factoryCode}`, accessToken, expiresIn)
	}

	public async getTokenByFactory(factoryCode: string): Promise<string | null> {
		return await this.cacheManager.get(`third_party_token:${factoryCode}`)
	}

	private async authenticate(factoryCode: string) {
		try {
			const accessToken = await this.cacheManager.get<string | null>(`third_party_token:${factoryCode}`)

			if (!accessToken) {
				const oauth2TokenResponse = await this.fetchOauth2Token(factoryCode)
				this.setTokenByFactory(factoryCode, oauth2TokenResponse.access_token, oauth2TokenResponse.expires_in)
				return oauth2TokenResponse.access_token
			}

			return accessToken
		} catch {
			await this.cacheManager.del(`sync_process:${factoryCode}`)
			return null
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
			FileLogger.error(error)
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
			const BASE_URL = this.configService.get<string>('THIRD_PARTY_API_URL')
			return await this.httpService.axiosRef.get<void, ThirdPartyApiResponseData>(`${BASE_URL}/epc/${param}`, {
				headers
			})
		} catch (error) {
			FileLogger.error(error.message)
		}
	}

	private async getCustomerEpcByCmdNo({ headers, params }: AxiosRequestConfig) {
		const BASE_URL = this.configService.get('THIRD_PARTY_API_URL')
		return await this.httpService.axiosRef.get<void, ThirdPartyApiResponseData[]>(`${BASE_URL}/epcs`, {
			headers,
			params
		})
	}

	private getFileToStoreData(factoryCode: string) {
		return `[${factoryCode}]-decker-api.data.json`
	}

	@OnEvent(ThirdPartyApiEvent.DISPATCH)
	protected async pullCustomerDataByFactory(e: FetchThirdPartyApiEvent) {
		try {
			let commandNumbers = []
			let epcs = []

			const accessToken = await this.authenticate(e.params.factoryCode)
			if (!accessToken) throw new Error('Failed to get Decker OAuth2 token')

			for (const item of e.data) {
				const data = await this.getCustomerEpcData({
					headers: { ['Authorization']: `Bearer ${accessToken}` },
					param: item
				})
				if (!data) continue
				commandNumbers = [...commandNumbers, data]
			}

			// * If there is no data fetched from the customer, then stop the process
			if (commandNumbers.length === 0) {
				Logger.warn('No data fetched from the customer')
				await this.cacheManager.del(`sync_process:${e.params.factoryCode}`)
				return
			}

			commandNumbers = uniqBy(commandNumbers, 'commandNumber').map((item) => item?.commandNumber)

			for (const cmdNo of commandNumbers) {
				const data = await this.getCustomerEpcByCmdNo({
					headers: { ['Authorization']: `Bearer ${accessToken}` },
					params: { commandNumber: cmdNo }
				})
				epcs = [...epcs, ...data]
			}

			const storeDataFileName = this.getFileToStoreData(e.params.factoryCode)

			writeFileSync(
				resolve(join(__dirname, '../..', `/assets/${storeDataFileName}`)),
				JSON.stringify({ epcs }, null, 3),
				'utf-8'
			)

			await this.eventEmitter.emitAsync(ThirdPartyApiEvent.FULFILL, {
				data: { file: storeDataFileName },
				params: e.params
			} satisfies SyncEventPayload)
		} catch (error) {
			FileLogger.error(error)
			this.cacheManager.del(`sync_process:${e.params.factoryCode}`)
		}
	}
}
