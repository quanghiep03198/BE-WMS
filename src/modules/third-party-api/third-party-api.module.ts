import { HttpModule, HttpService } from '@nestjs/axios'
import { Module, OnModuleInit } from '@nestjs/common'
import { Agent } from 'https'
// import { ThirdPartyApiInterceptor } from './third-party-api.interceptor'
import { ConfigService } from '@nestjs/config'
import { AxiosError, AxiosResponse } from 'axios'
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
				return response.data
			},
			(error: AxiosError) => Promise.reject(error.message)
		)
	}
}
