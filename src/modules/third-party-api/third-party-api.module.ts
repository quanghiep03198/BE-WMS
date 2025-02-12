import { FileLogger } from '@/common/helpers/file-logger.helper'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { HttpModule, HttpService } from '@nestjs/axios'
import { BullModule } from '@nestjs/bullmq'
import { forwardRef, MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AxiosError, AxiosResponse } from 'axios'
import { Agent } from 'https'
import { upperCase } from 'lodash'
import { FPInventoryEntity } from '../rfid/entities/fp-inventory.entity'
import { RFIDModule } from '../rfid/rfid.module'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { THIRD_PARTY_API_SYNC } from './constants'
import { ThirdPartyApiConsumer } from './third-party-api.consumer'
import { ThirdPartyApiController } from './third-party-api.controller'
import { ThirdPartyApiMiddleware } from './third-party-api.middleware'
import { ThirdPartyApiService } from './third-party-api.service'

@Module({
	imports: [
		TenancyModule,
		TypeOrmModule.forFeature([FPInventoryEntity], DATA_SOURCE_DATA_LAKE),
		HttpModule.register({ httpsAgent: new Agent({ keepAlive: true }) }),
		BullModule.registerQueue({
			name: THIRD_PARTY_API_SYNC,
			defaultJobOptions: { removeOnComplete: true }
		}),
		forwardRef(() => RFIDModule)
	],
	controllers: [ThirdPartyApiController],
	providers: [ThirdPartyApiService, ThirdPartyApiConsumer],
	exports: [HttpModule, ThirdPartyApiService, BullModule]
})
export class ThirdPartyApiModule implements NestModule, OnModuleInit {
	constructor(
		private readonly httpService: HttpService,
		private readonly configService: ConfigService
	) {}

	onModuleInit() {
		this.httpService.axiosRef.defaults.baseURL = this.configService.get('THIRD_PARTY_API_URL')

		this.httpService.axiosRef.interceptors.request.use(
			(config) => config,
			(error) => Promise.reject(error.message)
		)

		this.httpService.axiosRef.interceptors.response.use(
			<T>(response: AxiosResponse<T>) => {
				const requestMethod = upperCase(response.config.method)
				const requestURL = response.config.baseURL + response.config.url
				const errorStatus = response.status
				FileLogger.info(`${requestMethod} ${requestURL} ${errorStatus}`)
				return response.data
			},
			(error: AxiosError) => {
				const requestMethod = upperCase(error.config.method)
				const requestURL = error.config.baseURL + error.config.url
				const errorStatus = error.status
				FileLogger.error(`${requestMethod} ${requestURL} ${errorStatus}`)
				return Promise.reject(error.message)
			}
		)
	}

	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware, ThirdPartyApiMiddleware).forRoutes('/third-party-api/*')
	}
}
