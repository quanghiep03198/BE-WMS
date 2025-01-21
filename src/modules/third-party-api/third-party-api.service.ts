import { FileLogger } from '@/common/helpers/file-logger.helper'
import { DATA_SOURCE_ERP } from '@/databases/constants'
import { HttpService } from '@nestjs/axios'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { REQUEST } from '@nestjs/core'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { InjectDataSource } from '@nestjs/typeorm'
import { AxiosRequestConfig } from 'axios'
import { Cache } from 'cache-manager'
import { Request } from 'express'
import { readFileSync, writeFileSync } from 'fs'
import { chunk } from 'lodash'
import { join, resolve } from 'path'
import { DataSource } from 'typeorm'
import { FactoryCode } from '../department/constants'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'
import { TenancyService } from '../tenancy/tenancy.service'
import { ThirdPartyApiEvent } from './constants'
import {
	FetchThirdPartyApiEvent,
	OAuth2Credentials,
	OAuth2TokenResponse,
	SyncEventPayload,
	ThirdPartyApiResponseData
} from './interfaces/third-party-api.interface'
import { ThirdPartyApiHelper } from './third-party-api.helper'

@Injectable({ scope: Scope.REQUEST })
export class ThirdPartyApiService {
	private readonly logger: Logger

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@Inject(REQUEST) private readonly request: Request,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		private readonly httpService: HttpService,
		private readonly configService: ConfigService,
		private readonly eventEmitter: EventEmitter2,
		private readonly tenancyService: TenancyService,
		private readonly thirdPartyApiHelper: ThirdPartyApiHelper
	) {
		this.logger = new Logger(ThirdPartyApiService.name, { timestamp: true })
	}

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
			await this.thirdPartyApiHelper.exitSyncProcess(factoryCode)
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

	private async getOneEpc({
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

	private async getEpcByCommandNumber({ headers, params }: AxiosRequestConfig) {
		return await this.httpService.axiosRef.get<void, ThirdPartyApiResponseData[]>('/epcs', {
			headers,
			params
		})
	}

	@OnEvent(ThirdPartyApiEvent.DISPATCH)
	protected async onDispatchApiCall(e: FetchThirdPartyApiEvent) {
		try {
			let commandNumbers = []
			let epcs = []

			// * Authenticate the factory to get the OAuth2 token
			const accessToken = await this.authenticate(e.params.factoryCode)
			if (!accessToken) throw new Error('Failed to get Decker OAuth2 token')

			for (const item of e.data) {
				const data = await this.getOneEpc({
					headers: { ['Authorization']: `Bearer ${accessToken}` },
					param: item
				})
				if (!data) continue
				commandNumbers = [...commandNumbers, data]
			}

			// * If there is no data fetched from the customer, then stop the process
			if (commandNumbers.length === 0) {
				this.logger.warn('No data fetched from the customer')
				this.thirdPartyApiHelper.exitSyncProcess(e.params.factoryCode)
				return
			}

			commandNumbers = [...new Set(commandNumbers.map((item) => item?.commandNumber))]

			// * Fetch the EPC data by fetched command number
			for (const cmdNo of commandNumbers) {
				const data = await this.getEpcByCommandNumber({
					headers: { ['Authorization']: `Bearer ${accessToken}` },
					params: { commandNumber: cmdNo }
				})
				epcs = [...epcs, ...data]
			}

			// * Store the fetched EPC data to the file
			const storeDataFileName = `[${e.params.factoryCode}]-decker-api.data.json`

			writeFileSync(
				resolve(join(__dirname, '../..', `/data/__DECKER__/${storeDataFileName}`)),
				JSON.stringify({ epcs }, null, 3),
				'utf-8'
			)

			await this.eventEmitter.emitAsync(ThirdPartyApiEvent.FULFILL, {
				data: { file: storeDataFileName },
				params: e.params
			} satisfies SyncEventPayload)
		} catch (error) {
			FileLogger.error(error)
			this.thirdPartyApiHelper.exitSyncProcess(e.params.factoryCode)
		}
	}

	async upsertByCommandNumber(commandNumber: string) {
		const accessToken = this.request['access_token']
		const factoryCode = this.request.headers['x-user-company']

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

		const queryRunner = this.tenancyService.dataSource.createQueryRunner()

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

				await queryRunner.manager.query(/* SQL */ `
						MERGE INTO dv_rfidmatchmst_cust AS target
						USING (VALUES ${sourceValues}) AS source (
							EPC_Code, mo_no, mat_code, mo_noseq, or_no,
							or_custpo, shoestyle_codefactory, cust_shoestyle, size_code, size_numcode,
							factory_code_orders, factory_name_orders, factory_code_produce, factory_name_produce, size_qty
						)
						ON target.EPC_Code = source.EPC_Code
						WHEN NOT MATCHED THEN
							INSERT (
								EPC_Code, mo_no, mat_code, mo_noseq, or_no, or_custpo, 
								shoestyle_codefactory, cust_shoestyle, size_code, size_numcode,
								factory_code_orders, factory_name_orders, factory_code_produce, factory_name_produce, size_qty, 
								isactive, created, ri_date, ri_type, ri_foot, ri_cancel
							)
							VALUES (
								source.EPC_Code, source.mo_no, source.mat_code, source.mo_noseq, source.or_no, 
								source.or_custpo, source.shoestyle_codefactory, source.cust_shoestyle, source.size_code, source.size_numcode,
								source.factory_code_orders, source.factory_name_orders, source.factory_code_produce, source.factory_name_produce, source.size_qty, 
								'Y', GETDATE(), CAST(GETDATE() AS DATE), 'A', 'A', 0
							);
						`)
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

	async upsertByEpc(epc: string) {
		const accessToken = this.request['access_token']
		const factoryCode = this.request.headers['x-user-company']

		const data = await this.getOneEpc({
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

		const queryRunner = this.tenancyService.dataSource.createQueryRunner()
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

		await queryRunner.manager.query(/* SQL */ `
			MERGE INTO dv_rfidmatchmst_cust AS target
			USING (VALUES (
				'${upsertPayload.epc}', '${upsertPayload.mo_no}', '${upsertPayload.mat_code}','${upsertPayload.mo_noseq}', '${upsertPayload.or_no}', 
				'${upsertPayload.or_cust_po}', '${upsertPayload.shoes_style_code_factory}', '${upsertPayload.cust_shoes_style}', '${upsertPayload.size_code}', '${upsertPayload.size_numcode}', 
				'${upsertPayload.factory_code_orders}', '${upsertPayload.factory_name_orders}', '${upsertPayload.factory_code_produce}', '${upsertPayload.factory_name_produce}', ${upsertPayload.size_qty || 1}
			)) AS source (
				EPC_Code, mo_no, mat_code, mo_noseq, or_no, 
				or_custpo, shoestyle_codefactory, cust_shoestyle, size_code, size_numcode,
				factory_code_orders, factory_name_orders, factory_code_produce, factory_name_produce, size_qty
			)
			ON target.EPC_Code = source.EPC_Code
			WHEN NOT MATCHED THEN
				INSERT (
					EPC_Code, mo_no, mat_code, mo_noseq, or_no, or_custpo, 
					shoestyle_codefactory, cust_shoestyle, size_code, size_numcode,
					factory_code_orders, factory_name_orders, factory_code_produce, factory_name_produce, size_qty, 
					isactive, created, ri_date, ri_type, ri_foot, ri_cancel
				)
				VALUES (
					source.EPC_Code, source.mo_no, source.mat_code, source.mo_noseq, source.or_no, 
					source.or_custpo, source.shoestyle_codefactory, source.cust_shoestyle, source.size_code, source.size_numcode,
					source.factory_code_orders, source.factory_name_orders, source.factory_code_produce, source.factory_name_produce, source.size_qty, 
					'Y', GETDATE(), CAST(GETDATE() AS DATE), 'A', 'A', 0
				);
			`)
		return { affected: 1 }
	}
}
