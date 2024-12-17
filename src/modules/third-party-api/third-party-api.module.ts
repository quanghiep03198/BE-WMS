import { FileLogger } from '@/common/helpers/file-logger.helper'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { HttpModule, HttpService } from '@nestjs/axios'
import { MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AxiosError, AxiosResponse } from 'axios'
import { Agent } from 'https'
import { upperCase } from 'lodash'
import { FPInventoryEntity } from '../rfid/entities/fp-inventory.entity'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { ThirdPartyApiController } from './third-party-api.controller'
import { ThirdPartyApiHelper } from './third-party-api.helper'
import { ThirdPartyApiMiddleware } from './third-party-api.middleware'
import { ThirdPartyApiService } from './third-party-api.service'

@Module({
	imports: [
		TenancyModule,
		TypeOrmModule.forFeature([FPInventoryEntity], DATA_SOURCE_DATA_LAKE),
		HttpModule.register({ httpsAgent: new Agent({ keepAlive: true }) })
	],
	controllers: [ThirdPartyApiController],
	providers: [ThirdPartyApiService, ThirdPartyApiHelper],
	exports: [HttpModule, ThirdPartyApiService]
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
				FileLogger.info(`${requestMethod} ${requestURL} ${errorStatus}`)
				return Promise.reject(error.message)
			}
		)
	}

	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware, ThirdPartyApiMiddleware).forRoutes('/third-party-api/*')
	}
}
