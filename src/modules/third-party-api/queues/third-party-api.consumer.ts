import { Processor, WorkerHost } from '@nestjs/bullmq'
// import { Logger } from '@nestjs/common'
import { SuperJson } from '@common/utils'
import { generateShortId } from '@common/utils/short-id.util'
import { FactoryCode } from '@modules/department/constants'
import {
	EPC_MONGO_REPOSITORY,
	IEpcMongoRepository
} from '@modules/finished-goods/application/ports/epc-mongo.repository.port'
import {
	IMssqlFinishedGoodsRepository,
	MSSQL_FINISHED_GOODS_REPOSITORY
} from '@modules/finished-goods/application/ports/mssql-finished-goods.repository.port'
import { UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { FinishedGoodsGateway } from '@modules/finished-goods/presentation/gateways/finished-goods.gateway'
import { ORDER_REPOSITORY } from '@modules/order/order.constant'
import { IOrderRepository } from '@modules/order/order.repository.interface'
import { TManufacturingOrder } from '@modules/order/types'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { Cache } from 'cache-manager'
import { format } from 'date-fns'
import { groupBy } from 'lodash'
import { PinoLogger } from 'nestjs-pino'
import { THIRD_PARTY_API_SYNC } from '../constants'
import { SyncProcessState, ThirdPartyApiResponseData } from '../interfaces/third-party-api.interface'
import { DeckersOAuth2Strategy } from '../strategies/deckers-oauth2.strategy'
import { ThirdPartyApiService } from '../third-party-api.service'

@Processor(THIRD_PARTY_API_SYNC)
export class ThirdPartyApiConsumer extends WorkerHost {
	private processState: SyncProcessState[]

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@Inject(EPC_MONGO_REPOSITORY) private readonly epcRepository: IEpcMongoRepository,
		@Inject(MSSQL_FINISHED_GOODS_REPOSITORY)
		private readonly mssqlFinishedGoodsRepository: IMssqlFinishedGoodsRepository,
		@Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
		private readonly logger: PinoLogger,
		private readonly thirdPartyApiService: ThirdPartyApiService,
		private readonly thirdPartyApiOAuth2Service: DeckersOAuth2Strategy,
		private readonly eventGateway: FinishedGoodsGateway
	) {
		super()
		this.initializeProcessState()
	}

	/**
	 * @implements {WorkerHost.process}
	 * @param { Job<string[], void, string>} job
	 */
	public async process(job: Job<string[], void, string>): Promise<void> {
		const factoryCode = job.id as FactoryCode
		const data = job.data

		await this.broadcastStateChange()
		try {
			const accessToken = await this.authenticate(factoryCode)
			await this.executeSync(data, accessToken)
		} catch (error) {
			this.cancelRemainingSteps()
			await this.broadcastStateChange()
			this.logger.error(error)
			throw error
		} finally {
			await this.cacheManager.del('sync_states:deckers_data')
		}
	}

	private initializeProcessState() {
		this.processState = [
			{ id: 1, name: 'sync_data_steps.step_1', status: 'processing' },
			{ id: 2, name: 'sync_data_steps.step_2', status: 'waiting' },
			{ id: 3, name: 'sync_data_steps.step_3', status: 'waiting' },
			{ id: 4, name: 'sync_data_steps.step_4', status: 'waiting' }
		]
	}

	private updateProcessState(stepId: number, status: SyncProcessState['status']) {
		this.processState[stepId] = { ...this.processState[stepId], status }
	}

	private cancelRemainingSteps() {
		for (const step of this.processState) {
			if (step.status === 'completed') continue
			else step.status = 'cancelled'
		}
	}

	private async broadcastStateChange() {
		await this.cacheManager.set(
			'sync_states:deckers_data',
			SuperJson.stringify({
				event: 'sync_decker_data',
				ok: true,
				metadata: this.processState,
				error: null
			}),
			60 * 1000 * 5
		)
		this.eventGateway.server.emit('sync_decker_data', {
			event: 'sync_decker_data',
			ok: true,
			metadata: this.processState,
			error: null
		})
	}

	// * Step 1: Authenticate API via Decker OAuth2
	private async authenticate(factoryCode: FactoryCode): Promise<string> {
		const accessToken = await this.thirdPartyApiOAuth2Service.authenticate(factoryCode)
		if (!accessToken) {
			this.updateProcessState(0, 'failed')
			this.cancelRemainingSteps()
			await this.broadcastStateChange()
			throw new Error('Failed to get Decker OAuth2 token')
		}
		this.updateProcessState(0, 'completed')
		await this.broadcastStateChange()
		return accessToken
	}

	// * Step 2.1: Fetch command numbers
	private async fetchCommandNumbers(data: string[], accessToken: string): Promise<string[]> {
		this.updateProcessState(1, 'processing')
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
			throw new Error('Failed to fetch command numbers')
		}
	}

	// * Step 2.2: Fetch EPCs by command numbers
	private async fetchEpcsByCommandNumbers(
		commandNumbers: string[],
		accessToken: string
	): Promise<ThirdPartyApiResponseData[]> {
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
			throw new Error('Failed to fetch EPCs by command numbers')
		}
	}

	// * Step 2.2.1: Extract command numbers from EPCs
	private extractCommandNumbers(epcs: Array<ThirdPartyApiResponseData>): string[] {
		return [...new Set(Object.keys(groupBy(epcs, 'commandNumber')).map((item) => item.slice(0, 9)))]
	}

	// * Step 2.2.2: Get order information from ERP
	private async getManufacturingOrdersInfo(manufacturingOrders: string[]) {
		try {
			const data = await Promise.all(
				manufacturingOrders.map(async (mo) => await this.orderRepository.getManufacturingOrder(mo))
			)
			this.updateProcessState(2, 'processing')
			await this.broadcastStateChange()
			return data
		} catch {
			this.updateProcessState(2, 'failed')
			await this.broadcastStateChange()
			throw new Error('Failed to get order information from ERP')
		}
	}

	// * Step 3: Upsert data to database
	private async upsertData(epcs: Array<ThirdPartyApiResponseData>, manufacturingOrders: Array<TManufacturingOrder>) {
		const currentTimestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
		const syncId = generateShortId()
		const payload: UpsertEpcsMatchData = epcs.map((item) => {
			const matchSpecs = manufacturingOrders.find((data) => data.mo_no === item.commandNumber.slice(0, 9))

			const uniqSizeNumbers = item.sizeNumber.split('/').map((size) => size.trim())

			const sizeNumber = matchSpecs.sizes.find((size) => {
				return uniqSizeNumbers.some((uniqSizeNumber) =>
					new SizeNumber(size.size_numcode).isEqual(new SizeNumber(uniqSizeNumber))
				)
			})?.size_numcode

			const sizeQuantity =
				matchSpecs.sizes.find((size) => {
					if (!sizeNumber) return false
					return new SizeNumber(sizeNumber).isEqual(new SizeNumber(size.size_numcode))
				})?.size_qty ?? 1

			return {
				...matchSpecs,
				epc: item.epc,
				sync_id: syncId,
				size_numcode: new SizeNumber(sizeNumber).normalize('padleft'),
				size_qty: sizeQuantity ?? 1,
				remark: `[${currentTimestamp}] Info: Synchronized from Deckers API with command number "${item.commandNumber}"`
			}
		})
		await this.epcRepository.upsertEpcsMatch(payload, true)
		await this.mssqlFinishedGoodsRepository.upsertEpcsMatch(payload, true)
	}

	private async executeSync(data: string[], accessToken: string) {
		this.updateProcessState(1, 'processing')
		await this.broadcastStateChange()
		const commandNumbers = await this.fetchCommandNumbers(data, accessToken)
		if (commandNumbers.length === 0) {
			this.updateProcessState(1, 'completed')
			this.cancelRemainingSteps()
			this.updateProcessState(3, 'completed')
			await this.broadcastStateChange()
			this.logger.warn('No data fetched from the customer')
			return
		}
		const epcs = await this.fetchEpcsByCommandNumbers(commandNumbers, accessToken)
		const availableCommandNumbers = this.extractCommandNumbers(epcs)
		const manufacturingOrders = await this.getManufacturingOrdersInfo(availableCommandNumbers)
		this.updateProcessState(1, 'completed')
		this.updateProcessState(2, 'processing')
		await this.broadcastStateChange()
		await this.upsertData(epcs, manufacturingOrders)
		this.updateProcessState(2, 'completed')
		this.updateProcessState(3, 'completed')
		await this.broadcastStateChange()
	}
}
