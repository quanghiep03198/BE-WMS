import { HttpModule, HttpService } from '@nestjs/axios'
import { HttpStatus, Module, OnModuleInit } from '@nestjs/common'
import { Agent } from 'https'
// import { ThirdPartyApiInterceptor } from './third-party-api.interceptor'
import { ConfigService } from '@nestjs/config'
import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { ThirdPartyApiService } from './third-party-api.service'

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
				if (config.baseURL === this.configService.get('THIRD_PARTY_API_URL')) {
					const factoryCode = config.headers['X-Factory']

					if (!factoryCode) return config
					const accessToken = await this.thirdPartyApiService.getTokenByFactory(factoryCode)
					config.headers['Authorization'] = `Bearer ${accessToken}`
				}
				return config
			},
			(error) => {
				return Promise.reject(error.message)
			}
		)

		this.httpService.axiosRef.interceptors.response.use(
			<T>(response: AxiosResponse<T>) => {
				return response.data
			},
			async (error: AxiosError) => {
				const originalRequest: InternalAxiosRequestConfig = error.config
				const errorStatus = error.status
				if (originalRequest && !originalRequest['retry'] && errorStatus === HttpStatus.UNAUTHORIZED) {
					const tokenResponse = await this.thirdPartyApiService.fetchOauth2Token(
						originalRequest.headers['X-Factory']
					)
					if (!tokenResponse) return Promise.reject('Token response is empty')
					await this.thirdPartyApiService.setTokenByFactory(
						originalRequest.headers['X-Factory'],
						tokenResponse?.access_token,
						tokenResponse?.expires_in
					)
					originalRequest.headers['Authorization'] = `${tokenResponse?.token_type} ${tokenResponse?.access_token}`
					const response = await this.httpService.axiosRef.request(originalRequest)
					originalRequest['retry'] = true
					return response
				}
				return Promise.reject(error.message)
			}
		)
	}
}
