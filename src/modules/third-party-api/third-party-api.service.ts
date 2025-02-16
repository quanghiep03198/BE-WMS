import { FileLogger } from '@/common/helpers/file-logger.helper'
import { DATA_SOURCE_ERP } from '@/databases/constants'
import { HttpService } from '@nestjs/axios'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { AxiosRequestConfig } from 'axios'
import { Cache } from 'cache-manager'
import { readFileSync } from 'fs-extra'
import { chunk } from 'lodash'
import { join, resolve } from 'path'
import { DataSource } from 'typeorm'
import { FactoryCode } from '../department/constants'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'
import { TENANCY_DATASOURCE } from '../tenancy/constants'
import {
	OAuth2Credentials,
	OAuth2TokenResponse,
	ThirdPartyApiResponseData
} from './interfaces/third-party-api.interface'

@Injectable()
export class ThirdPartyApiService {
	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@Inject(TENANCY_DATASOURCE) private readonly dataSource: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		private readonly httpService: HttpService,
		private readonly configService: ConfigService
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

	private async setTokenByFactory(factoryCode: string, accessToken: string, expiresIn: number) {
		return await this.cacheManager.set(`third_party_token:${factoryCode}`, accessToken, expiresIn)
	}

	private async getTokenByFactory(factoryCode: string): Promise<string | null> {
		return await this.cacheManager.get<string | null>(`third_party_token:${factoryCode}`)
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

	public async fetchOneEpc({
		headers,
		param
	}: {
		headers: AxiosRequestConfig['headers']
		param: string
	}): Promise<ThirdPartyApiResponseData> {
		try {
			return await this.httpService.axiosRef.get<void, ThirdPartyApiResponseData>(`/epc/${param}`, {
				headers
			})
		} catch (error) {
			FileLogger.error(error.message)
		}
	}

	public async getEpcByCommandNumber({ headers, params }: AxiosRequestConfig) {
		return await this.httpService.axiosRef.get<void, ThirdPartyApiResponseData[]>('/epcs', {
			headers,
			params
		})
	}

	async upsertByCommandNumber(accessToken: string, factoryCode: string, commandNumber: string) {
		const data = await this.getEpcByCommandNumber({
			headers: { ['Authorization']: `Bearer ${accessToken}` },
			params: { commandNumber: commandNumber }
		})

		if (!Array.isArray(data) || data.length === 0) {
			throw new NotFoundException('No data fetched from the customer')
		}

		const orderInformationQuery = readFileSync(
			join(__dirname, '../rfid/sql/order-information.sql'),
			'utf-8'
		).toString()

		const orderInformation = await this.dataSourceERP
			.query<Partial<RFIDMatchCustomerEntity>[]>(orderInformationQuery, [commandNumber])
			.then((data) => data?.at(0))

		if (!orderInformation) {
			throw new NotFoundException(`Order information could not be found`)
		}

		const queryRunner = this.dataSource.createQueryRunner()

		const sourceData = data.map((item) => ({
			...orderInformation,
			epc: item.epc,
			size_numcode: item.sizeNumber,
			factory_code_orders: factoryCode,
			factory_name_orders: factoryCode,
			factory_code_produce: factoryCode,
			factory_name_produce: factoryCode
		}))

		const chunkPayload = chunk(sourceData, 2000)

		await queryRunner.connect()
		await queryRunner.startTransaction()

		try {
			for (const payload of chunkPayload) {
				const sourceValues = payload
					.map((item) => {
						return `(
							'${item.epc}', '${item.mo_no}', '${item.mat_code}','${item.mo_noseq}', '${item.or_no}',
							'${item.or_cust_po}', '${item.shoes_style_code_factory}', '${item.cust_shoes_style}', '${item.size_code}', '${item.size_numcode}',
							'${item.factory_code_orders}', '${item.factory_name_orders}', '${item.factory_code_produce}', '${item.factory_name_produce}', ${item.size_qty || 1}
						)`
					})
					.join(',')
				const upsertQuery = readFileSync(resolve(join(__dirname, '../rfid/upsert-rfid-match.sql')))
					.toString()
					.replace(':values', sourceValues)
				await queryRunner.manager.query(upsertQuery)
			}
			await queryRunner.commitTransaction()
			return { affected: sourceData.length }
		} catch (error) {
			await queryRunner.rollbackTransaction()
			FileLogger.error(error)
			throw new InternalServerErrorException(error)
		} finally {
			await queryRunner.release()
		}
	}

	async upsertByEpc(accessToken: string, factoryCode: string, epc: string) {
		const data = await this.fetchOneEpc({
			headers: { ['Authorization']: `Bearer ${accessToken}` },
			param: epc
		})

		if (!data) {
			throw new NotFoundException('No data fetched from the customer')
		}

		const orderInformationQuery = readFileSync(
			join(__dirname, '../rfid/sql/order-information.sql'),
			'utf-8'
		).toString()

		const orderInformation = await this.dataSourceERP
			.query<Partial<RFIDMatchCustomerEntity>[]>(orderInformationQuery, [data.commandNumber])
			.then((data) => data?.at(0))

		if (!orderInformation) {
			throw new NotFoundException(`Order information could not be found`)
		}

		const queryRunner = this.dataSource.createQueryRunner()
		await queryRunner.connect()

		const upsertPayload = {
			...orderInformation,
			epc: data.epc,
			size_numcode: data.sizeNumber,
			factory_code_orders: factoryCode,
			factory_name_orders: factoryCode,
			factory_code_produce: factoryCode,
			factory_name_produce: factoryCode
		}

		const upsertQuery = readFileSync(resolve(join(__dirname, '../rfid/upsert-rfid-match.sql')))
			.toString()
			.replace(
				':values',
				`(
					'${upsertPayload.epc}', '${upsertPayload.mo_no}', '${upsertPayload.mat_code}','${upsertPayload.mo_noseq}', '${upsertPayload.or_no}', 
					'${upsertPayload.or_cust_po}', '${upsertPayload.shoes_style_code_factory}', '${upsertPayload.cust_shoes_style}', '${upsertPayload.size_code}', '${upsertPayload.size_numcode}', 
					'${upsertPayload.factory_code_orders}', '${upsertPayload.factory_name_orders}', '${upsertPayload.factory_code_produce}', '${upsertPayload.factory_name_produce}', ${upsertPayload.size_qty || 1}
				)`
			)

		await queryRunner.manager.query(upsertQuery)

		return { affected: 1 }
	}
}
