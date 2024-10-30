import { HttpModule, HttpService } from '@nestjs/axios'
import { HttpStatus, Logger, Module, OnModuleInit } from '@nestjs/common'
import { Agent } from 'https'
// import { ThirdPartyApiInterceptor } from './third-party-api.interceptor'
import { ConfigService } from '@nestjs/config'
import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { ThirdPartyApiService } from './third-party.service'

@Module({
	imports: [HttpModule.register({ httpsAgent: new Agent({ keepAlive: true }) })],
	providers: [ThirdPartyApiService],
	exports: [HttpModule, ThirdPartyApiService]
})
export class ThirdPartyApiModule implements OnModuleInit {
	constructor(
		private readonly httpService: HttpService,
		private readonly configService: ConfigService,
		private readonly thirdPartyApiService: ThirdPartyApiService
	) {}

	onModuleInit() {
		this.httpService.axiosRef.defaults.baseURL = this.configService.get('THIRD_PARTY_API_URL')

		this.httpService.axiosRef.interceptors.request.use(
			async (config) => {
				Logger.debug(config.baseURL)
				if (config.baseURL === this.configService.get('THIRD_PARTY_API_URL')) {
					const factoryCode = config.headers['X-Factory']
					const accessToken = await this.thirdPartyApiService.getTokenByFactory(factoryCode)
					config.headers['Authorization'] = `Bearer ${accessToken}`
				}
				return config
			},
			(error) => {
				return Promise.reject(error)
			}
		)

		this.httpService.axiosRef.interceptors.response.use(
			<T>(response: AxiosResponse<T>) => {
				return response
			},
			async (error: AxiosError) => {
				const originalRequest: InternalAxiosRequestConfig = error.config
				const errorStatus = error.status
				if (originalRequest && !originalRequest['retry'] && errorStatus === HttpStatus.UNAUTHORIZED) {
					const refreshToken = await this.thirdPartyApiService.fetchOauth2Token(
						originalRequest.headers['X-Factory']
					)
					originalRequest.headers['Authorization'] = `Bearer ${refreshToken}`
					this.httpService.axiosRef.request(originalRequest)
					originalRequest['retry'] = true
				}
				return Promise.reject(error)
			}
		)
	}
}
