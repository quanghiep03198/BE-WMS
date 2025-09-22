import { HttpService } from '@nestjs/axios'
import { Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { AxiosRequestConfig } from 'axios'
import { readFileSync } from 'fs-extra'
import { chunk } from 'lodash'
import { PinoLogger } from 'nestjs-pino'
import { join, resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { OrderService } from '../order/order.service'
import { TENANCY_DATA_SOURCE } from '../tenancy/constants'
import { ThirdPartyApiResponseData } from './interfaces/third-party-api.interface'

@Injectable()
export class ThirdPartyApiService {
	private readonly upsertQuery = readFileSync(resolve(join(__dirname, '../rfid/sql/upsert-rfid-match.sql')), 'utf-8')

	constructor(
		private readonly logger: PinoLogger,
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSource: DataSource,
		private readonly httpService: HttpService,
		private readonly orderService: OrderService
	) {}

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
			this.logger.error(error)
		}
	}

	public async getEpcByCommandNumber({ headers, params }: AxiosRequestConfig) {
		return await this.httpService.axiosRef.get<void, ThirdPartyApiResponseData[]>('/epcs', {
			headers,
			params
		})
	}

	public async upsertByCommandNumber(accessToken: string, factoryCode: string, commandNumber: string) {
		const data = await this.getEpcByCommandNumber({
			headers: { ['Authorization']: `Bearer ${accessToken}` },
			params: { commandNumber: commandNumber }
		})

		if (!Array.isArray(data) || data.length === 0) {
			throw new NotFoundException('No data fetched from the customer')
		}

		const orderInformation = await this.orderService
			.getCustOrderByCommandNumber(commandNumber.slice(0, 9))
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

		try {
			await queryRunner.startTransaction()

			for (const payload of chunkPayload) {
				const sourceValues = payload
					.map((item) => {
						return `(
							'${item.epc}', '${item.mo_no}', '${item.mat_code}', '${item.mo_noseq}', '${item.or_no}', '${item.or_cust_po}', 
							'${item.factory_shoes_style}', '${item.cust_shoes_style.replace('/', '\/')}', '${item.size_code}', '${item.size_numcode}',
							'${item.factory_code_orders}', '${item.factory_name_orders}', '${item.factory_code_produce}', '${item.factory_name_produce}', ${item.size_qty || 1},
							'${item.remark ?? ''}'
						)`
					})
					.join(',')
				const upsertQuery = this.upsertQuery.replace(':values', sourceValues)
				await queryRunner.manager.query(upsertQuery)
			}
			await queryRunner.commitTransaction()
			return { affected: sourceData.length }
		} catch (error) {
			this.logger.error(error)
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error)
		} finally {
			await queryRunner.release()
		}
	}

	public async upsertByEpc(accessToken: string, factoryCode: string, epc: string) {
		const data = await this.fetchOneEpc({
			headers: { ['Authorization']: `Bearer ${accessToken}` },
			param: epc
		})

		if (!data) {
			throw new NotFoundException('No data fetched from the customer')
		}

		const orderInformation = await this.orderService
			.getCustOrderByCommandNumber(data.commandNumber)
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

		const upsertQuery = this.upsertQuery.replace(
			':values',
			`(
				'${upsertPayload.epc}', '${upsertPayload.mo_no}', '${upsertPayload.mat_code}','${upsertPayload.mo_noseq}', '${upsertPayload.or_no}', 
				'${upsertPayload.or_cust_po}', '${upsertPayload.factory_shoes_style}', '${upsertPayload.cust_shoes_style}', '${upsertPayload.size_code}', '${upsertPayload.size_numcode}', 
				'${upsertPayload.factory_code_orders}', '${upsertPayload.factory_name_orders}', '${upsertPayload.factory_code_produce}', '${upsertPayload.factory_name_produce}', ${upsertPayload.size_sumqty || 1}, 'Upserted from WMS'
			)`
		)

		await queryRunner.manager.query(upsertQuery)

		return { affected: 1 }
	}
}
