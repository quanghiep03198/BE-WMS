import { FileLogger } from '@/common/helpers/file-logger.helper'
import { HttpModule, HttpService } from '@nestjs/axios'
import { Module, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AxiosError, AxiosResponse } from 'axios'
import { Agent } from 'https'
import { upperCase } from 'lodash'
import { ThirdPartyApiService } from './third-party-api.service'

@Module({
	imports: [HttpModule.register({ httpsAgent: new Agent({ keepAlive: true }) })],
	providers: [ThirdPartyApiService],
	exports: [HttpModule, ThirdPartyApiService]
})
export class ThirdPartyApiModule implements OnModuleInit {
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
}
