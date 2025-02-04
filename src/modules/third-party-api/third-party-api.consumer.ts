import { FileLogger } from '@/common/helpers/file-logger.helper'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger, UnauthorizedException } from '@nestjs/common'
import { Job } from 'bullmq'
import { groupBy } from 'lodash'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'
import { FPIRespository } from '../rfid/rfid.repository'
import { THIRD_PARTY_API_SYNC } from './constants'
import { ThirdPartyApiService } from './third-party-api.service'

@Processor(THIRD_PARTY_API_SYNC, { concurrency: 3 })
export class ThirdPartyApiConsumer extends WorkerHost {
	private readonly logger = new Logger(ThirdPartyApiConsumer.name)

	constructor(
		private readonly thirdPartyApiService: ThirdPartyApiService,
		private readonly rfidRepository: FPIRespository
	) {
		super()
	}

	async process(job: Job<string[], void, string>): Promise<void> {
		const factoryCode: string = job.name
		const tenantId: string = job.id

		try {
			const accessToken = await this.thirdPartyApiService.authenticate(factoryCode)
			if (!accessToken) throw new UnauthorizedException('Failed to get Decker OAuth2 token')

			const commandNumbers = await this.fetchCommandNumbers(job.data, accessToken)
			if (commandNumbers.length === 0) {
				this.logger.warn('No data fetched from the customer')
				return
			}

			const epcs = await this.fetchEpcsByCommandNumbers(commandNumbers, accessToken)
			const availableCommandNumbers = this.extractCommandNumbers(epcs)
			const orderInformation = await this.rfidRepository.getOrderInformationFromERP(availableCommandNumbers)

			const payload = this.createPayload(epcs, orderInformation, factoryCode)
			await this.rfidRepository.upsertBulk(tenantId, payload)
		} catch (error) {
			FileLogger.error(error)
		}
	}

	private async fetchCommandNumbers(data: string[], accessToken: string): Promise<string[]> {
		const commandNumbers = await Promise.all(
			data.map(async (item) => {
				const response = await this.thirdPartyApiService.getOneEpc({
					headers: { Authorization: `Bearer ${accessToken}` },
					param: item
				})
				return response?.commandNumber
			})
		)
		return [...new Set(commandNumbers.filter(Boolean))]
	}

	private async fetchEpcsByCommandNumbers(commandNumbers: string[], accessToken: string): Promise<any[]> {
		const epcs = await Promise.all(
			commandNumbers.map(async (commandNumber) => {
				return this.thirdPartyApiService.getEpcByCommandNumber({
					headers: { Authorization: `Bearer ${accessToken}` },
					params: { commandNumber }
				})
			})
		)
		return epcs.flat()
	}

	private extractCommandNumbers(epcs: any[]): string[] {
		return [...new Set(Object.keys(groupBy(epcs, 'commandNumber')).map((item) => item.slice(0, 9)))]
	}

	private createPayload(
		epcs: any[],
		orderInformation: any[],
		factoryCode: string
	): Partial<RFIDMatchCustomerEntity>[] {
		return epcs.map((item) => ({
			...orderInformation.find((data) => data.mo_no === item.commandNumber.slice(0, 9)),
			epc: item.epc,
			size_numcode: item.sizeNumber,
			factory_code_orders: factoryCode,
			factory_name_orders: factoryCode,
			factory_code_produce: factoryCode,
			factory_name_produce: factoryCode
		}))
	}
}
