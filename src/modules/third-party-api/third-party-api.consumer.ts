import { FileLogger } from '@/common/helpers/file-logger.helper'
import { IoRedisService } from '@/messages/ioredis.service'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger, UnauthorizedException } from '@nestjs/common'
import { Job } from 'bullmq'
import { groupBy } from 'lodash'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'
import { FPIRespository } from '../rfid/rfid.repository'
import { THIRD_PARTY_API_SYNC } from './constants'
import { SyncProcessState } from './interfaces/third-party-api.interface'
import { ThirdPartyApiService } from './third-party-api.service'

@Processor(THIRD_PARTY_API_SYNC)
export class ThirdPartyApiConsumer extends WorkerHost {
	protected processState: SyncProcessState[]
	private readonly logger = new Logger(ThirdPartyApiConsumer.name)
	static readonly SYNC_DATA_EVENT: string = 'SYNC_DATA'

	constructor(
		private readonly thirdPartyApiService: ThirdPartyApiService,
		private readonly rfidRepository: FPIRespository,
		private readonly ioRedisService: IoRedisService
	) {
		super()
		this.initializeProcessState()
	}

	/**
	 * @implements {WorkerHost.process}
	 * @param { Job<string[], void, string>} job
	 */
	public async process(job: Job<string[], void, string>): Promise<void> {
		const factoryCode: string = job.id
		const tenantId: string = job.name

		await this.broadcastStateChange(factoryCode)
		try {
			const accessToken = await this.authenticateWithDecker(factoryCode)
			const commandNumbers = await this.fetchCommandNumbers(job.data, accessToken)
			await this.handleCommandNumbers(commandNumbers, factoryCode, tenantId, accessToken)
		} catch (error) {
			this.handleError(error, factoryCode)
		}
	}

	private initializeProcessState() {
		this.processState = [
			{ id: 1, name: 'rfid.sync_data_steps.step_1', status: 'processing' },
			{ id: 2, name: 'rfid.sync_data_steps.step_2', status: 'waiting' },
			{ id: 3, name: 'rfid.sync_data_steps.step_3', status: 'waiting' }
		]
	}

	private async authenticateWithDecker(factoryCode: string): Promise<string> {
		const accessToken = await this.thirdPartyApiService.authenticate(factoryCode)
		if (!accessToken) {
			this.updateProcessState(0, 'failed')
			this.cancelRemainingSteps()
			await this.broadcastStateChange(factoryCode)
			throw new UnauthorizedException('Failed to get Decker OAuth2 token')
		}
		this.updateProcessState(0, 'completed')
		this.updateProcessState(1, 'processing')
		await this.broadcastStateChange(factoryCode)
		return accessToken
	}

	private async fetchCommandNumbers(data: string[], accessToken: string): Promise<string[]> {
		try {
			const commandNumbers = await Promise.all(
				data.map(async (item) => {
					const response = await this.thirdPartyApiService.fetchOneEpc({
						headers: { Authorization: `Bearer ${accessToken}` },
						param: item
					})
					return response?.commandNumber
				})
			)
			return [...new Set(commandNumbers.filter(Boolean))]
		} catch {
			this.updateProcessState(1, 'failed')
			this.cancelRemainingSteps()
			throw new Error('Failed to fetch command numbers')
		}
	}

	private async handleCommandNumbers(
		commandNumbers: string[],
		factoryCode: string,
		tenantId: string,
		accessToken: string
	) {
		if (commandNumbers.length === 0) {
			this.updateProcessState(1, 'completed')
			this.updateProcessState(2, 'cancelled')
			await this.broadcastStateChange(factoryCode)
			this.logger.warn('No data fetched from the customer')
			return
		}

		const epcs = await this.fetchEpcsByCommandNumbers(commandNumbers, accessToken)
		const availableCommandNumbers = this.extractCommandNumbers(epcs)
		const orderInformation = await this.getOrderInformation(availableCommandNumbers, factoryCode)
		const payload = this.createPayload(epcs, orderInformation, factoryCode)

		await this.upsertData(tenantId, payload, factoryCode)
	}

	private async fetchEpcsByCommandNumbers(commandNumbers: string[], accessToken: string): Promise<any[]> {
		try {
			const epcs = await Promise.all(
				commandNumbers.map(async (commandNumber) => {
					return this.thirdPartyApiService.getEpcByCommandNumber({
						headers: { Authorization: `Bearer ${accessToken}` },
						params: { commandNumber }
					})
				})
			)
			return epcs.flat()
		} catch {
			this.updateProcessState(1, 'failed')
			this.cancelRemainingSteps()
			throw new Error('Failed to fetch EPCs by command numbers')
		}
	}

	private extractCommandNumbers(epcs: any[]): string[] {
		return [...new Set(Object.keys(groupBy(epcs, 'commandNumber')).map((item) => item.slice(0, 9)))]
	}

	private async getOrderInformation(commandNumbers: string[], factoryCode: string): Promise<any[]> {
		try {
			const data = await this.rfidRepository.getOrderInformationFromERP(commandNumbers)
			this.updateProcessState(1, 'completed')
			this.updateProcessState(2, 'processing')
			await this.broadcastStateChange(factoryCode)
			return data
		} catch {
			this.updateProcessState(1, 'completed')
			this.updateProcessState(2, 'failed')
			await this.broadcastStateChange(factoryCode)
			throw new Error('Failed to get order information from ERP')
		}
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

	private async upsertData(tenantId: string, payload: Partial<RFIDMatchCustomerEntity>[], factoryCode: string) {
		try {
			await this.rfidRepository.upsertBulk(tenantId, payload)
			this.updateProcessState(2, 'completed')
			await this.broadcastStateChange(factoryCode)
		} catch {
			this.updateProcessState(2, 'failed')
			await this.broadcastStateChange(factoryCode)
		}
	}

	private updateProcessState(stepId: number, status: SyncProcessState['status']) {
		this.processState[stepId].status = status
	}

	private cancelRemainingSteps() {
		for (let i = 1; i < this.processState.length; i++) {
			this.processState[i].status = 'cancelled'
		}
	}

	private async broadcastStateChange(channelId: string) {
		await this.ioRedisService.publish(`SYNC_DECKER_DATA:${channelId}`, JSON.stringify(this.processState))
	}

	private handleError(error: Error, factoryCode: string) {
		FileLogger.error(error)
		this.updateProcessState(2, 'failed')
		this.broadcastStateChange(factoryCode)
		throw new Error(error.message)
	}
}
