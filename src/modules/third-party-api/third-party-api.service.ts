import { HttpService } from '@nestjs/axios'
import { Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { AxiosRequestConfig } from 'axios'
import { format } from 'date-fns'
import { readFileSync } from 'fs-extra'
import { chunk } from 'lodash'
import { PinoLogger } from 'nestjs-pino'
import { join, resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { OrderService } from '../order/order.service'
import { RFIDMatchCustomerEntity } from '../rfid/infrastructure/persistence/mssql/rfid-customer-match.entity'
import { TENANCY_DATA_SOURCE } from '../tenancy/constants'
import { ThirdPartyApiResponseData } from './interfaces/third-party-api.interface'

@Injectable()
export class ThirdPartyApiService {
	private readonly upsertRfidMatchQuery = readFileSync(
		resolve(join(__dirname, '../rfid/sql/upsert-rfid-match.sql')),
		'utf-8'
	)

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
			epc: item.epc,
			mo_no: orderInformation.mo_no,
			mat_code: orderInformation.mat_code,
			mo_noseq: orderInformation.mo_noseq,
			or_no: orderInformation.or_no,
			or_custpo: orderInformation.or_cust_po,
			shoestyle_codefactory: orderInformation.factory_shoes_style,
			cust_shoestyle: orderInformation.cust_shoes_style?.replace('/', '\/'),
			size_code: orderInformation.size_code,
			size_numcode: item.sizeNumber,
			factory_code_orders: factoryCode,
			factory_name_orders: factoryCode,
			factory_code_produce: factoryCode,
			factory_name_produce: factoryCode,
			size_qty: orderInformation.size_sumqty || 1,
			remark: ''
		}))

		const chunkPayload = chunk(sourceData, 2000)

		await queryRunner.connect()

		try {
			await queryRunner.startTransaction()

			for (const payload of chunkPayload) {
				await queryRunner.manager.query(this.upsertRfidMatchQuery, [JSON.stringify(payload)])
			}
			await queryRunner.commitTransaction()
			return { affected: sourceData.length }
		} catch (error) {
			this.logger.error(error)
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error)
		} finally {
			if (!queryRunner.isReleased) await queryRunner.release()
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

		const currentTimestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss')

		const upsertPayload: Partial<RFIDMatchCustomerEntity> = {
			...orderInformation,
			epc: data.epc,
			cust_shoes_style: orderInformation.cust_shoes_style?.replace('/', '\/'),
			size_numcode: data.sizeNumber,
			factory_code_orders: factoryCode,
			factory_name_orders: factoryCode,
			factory_code_produce: factoryCode,
			factory_name_produce: factoryCode,
			remark: `[${currentTimestamp}] Info: Synchronized from Deckers API with command number "${data.commandNumber}"`
		}

		await queryRunner.manager.query(this.upsertRfidMatchQuery, [JSON.stringify([upsertPayload])])

		return { affected: 1 }
	}
}
