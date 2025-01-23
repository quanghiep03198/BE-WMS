import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { groupBy } from 'lodash'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'
import { FPIRespository } from '../rfid/rfid.repository'
import { TenancyService } from '../tenancy/tenancy.service'
import { THIRD_PARTY_API_SYNC } from './constants'
import { ThirdPartyApiService } from './third-party-api.service'

@Processor(THIRD_PARTY_API_SYNC)
export class ThirdPartyApiConsumer extends WorkerHost {
	private readonly logger = new Logger(ThirdPartyApiConsumer.name)

	constructor(
		private readonly thirdPartyApiService: ThirdPartyApiService,
		private readonly rfidRepository: FPIRespository,
		private readonly tenancyService: TenancyService
	) {
		super()
	}

	async process(job: Job): Promise<any> {
		try {
			let commandNumbers = []
			let epcs = []

			// * Due to this job only can run at once by each factory, so facotory code is used as the job name
			const factoryCode: string = job.name
			const tenantId: string = job.id

			// * Authenticate the factory to get the OAuth2 token
			const accessToken = await this.thirdPartyApiService.authenticate(factoryCode)
			if (!accessToken) throw new Error('Failed to get Decker OAuth2 token')

			for (const item of job.data) {
				const data = await this.thirdPartyApiService.getOneEpc({
					headers: { ['Authorization']: `Bearer ${accessToken}` },
					param: item
				})
				if (!data) continue
				commandNumbers = [...commandNumbers, data]
			}

			// * If there is no data fetched from the customer, then stop the process
			if (commandNumbers.length === 0) {
				this.logger.warn('No data fetched from the customer')
				// this.thirdPartyApiHelper.exitSyncProcess(e.params.factoryCode)
				return
			}

			commandNumbers = [...new Set(commandNumbers.map((item) => item?.commandNumber))]

			// * Fetch the EPC data by fetched command number
			for (const cmdNo of commandNumbers) {
				const data = await this.thirdPartyApiService.getEpcByCommandNumber({
					headers: { ['Authorization']: `Bearer ${accessToken}` },
					params: { commandNumber: cmdNo }
				})
				epcs = [...epcs, ...data]
			}
			Logger.debug(JSON.stringify(epcs))

			// * Retrieve unique command numbers from Third Party API response data
			const availableCommandNums = Object.keys(groupBy(epcs, 'commandNumber')).map((item) => item.slice(0, 9)) // * Extract first 9 characters

			// * Retrieve order information from ERP
			const orderInformation = await this.rfidRepository.getOrderInformationFromERP([
				...new Set(availableCommandNums)
			])

			// * Upsert data to database
			const payload: Partial<RFIDMatchCustomerEntity>[] = epcs.map((item) => ({
				...orderInformation.find((data) => data.mo_no === item.commandNumber.slice(0, 9)),
				epc: item.epc,
				size_numcode: item.sizeNumber,
				factory_code_orders: factoryCode,
				factory_name_orders: factoryCode,
				factory_code_produce: factoryCode,
				factory_name_produce: factoryCode
			}))

			const tenant = this.tenancyService.findOneById(tenantId)
			await this.rfidRepository.upsertBulk(tenant.host, payload)
		} catch (error) {
			Logger.error(error)
		}
	}
}
