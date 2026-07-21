import {
	IIoMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mssql.repository.port'
import { UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { HttpService } from '@nestjs/axios'
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { AxiosRequestConfig } from 'axios'
import { format } from 'date-fns'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ThirdPartyApiResponseData } from './interfaces/third-party-api.interface'

@Injectable()
export class ThirdPartyApiService {
	constructor(
		@InjectPinoLogger(ThirdPartyApiService.name)
		private readonly logger: PinoLogger,

		@Inject(IO_MSSQL_REPOSITORY) private readonly ioMssqlRepository: IIoMssqlRepository,

		private readonly httpService: HttpService
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

		this.logger.debug(data)

		if (!Array.isArray(data) || data.length === 0) {
			throw new NotFoundException('No data fetched from the customer')
		}

		const manufacturingOrders = await this.ioMssqlRepository.getManufacturingOrder(commandNumber.slice(0, 9))

		if (!manufacturingOrders) {
			throw new NotFoundException(`Order information could not be found`)
		}

		const sourceData: UpsertEpcsMatchData = data.map((item) => {
			const uniqSizeNumbers = item.sizeNumber.split('/').map((size) => size.trim())

			const sizeNumber = manufacturingOrders.sizes.find((size) => {
				return uniqSizeNumbers.some((uniqSizeNumber) =>
					new SizeNumber(size.size_numcode).isEqual(new SizeNumber(uniqSizeNumber))
				)
			})?.size_numcode

			const sizeQuantity =
				manufacturingOrders.sizes.find((size) => {
					if (!sizeNumber) return false
					return new SizeNumber(sizeNumber).isEqual(new SizeNumber(size.size_numcode))
				})?.size_qty ?? 1

			return {
				...manufacturingOrders,
				epc: item.epc,
				cust_shoestyle: manufacturingOrders.cust_shoes_style?.replace('/', '\/'),
				size_numcode: new SizeNumber(sizeNumber).normalize('padleft'),
				size_qty: sizeQuantity,
				remark: ''
			}
		})

		await this.ioMssqlRepository.upsertEpcsMatch(sourceData)
	}

	public async upsertByEpc(accessToken: string, epc: string) {
		const data = await this.fetchOneEpc({
			headers: { ['Authorization']: `Bearer ${accessToken}` },
			param: epc
		})

		if (!data) throw new NotFoundException('No data fetched from the customer')

		const manufacturingOrder = await this.ioMssqlRepository.getManufacturingOrder(data.commandNumber)

		if (!manufacturingOrder) {
			throw new NotFoundException(`Order information could not be found`)
		}

		const currentTimestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss')

		const uniqSizeNumbers = data.sizeNumber.split('/').map((size) => size.trim())

		const sizeNumber = manufacturingOrder.sizes.find((size) => {
			return uniqSizeNumbers.some((uniqSizeNumber) =>
				new SizeNumber(size.size_numcode).isEqual(new SizeNumber(uniqSizeNumber))
			)
		})?.size_numcode

		const sizeQuantity =
			manufacturingOrder.sizes.find((size) => {
				if (!sizeNumber) return false
				return new SizeNumber(sizeNumber).isEqual(new SizeNumber(size.size_numcode))
			})?.size_qty ?? 1

		const upsertPayload: UpsertEpcsMatchData[number] = {
			...manufacturingOrder,
			epc: data.epc,
			cust_shoes_style: manufacturingOrder.cust_shoes_style?.replace('/', '\/'),
			size_numcode: new SizeNumber(sizeNumber).normalize('padleft'),
			size_qty: sizeQuantity,
			remark: `[${currentTimestamp}] Info: Synchronized from Deckers API with command number "${data.commandNumber}"`
		}

		await this.ioMssqlRepository.upsertEpcsMatch([upsertPayload])
	}
}
