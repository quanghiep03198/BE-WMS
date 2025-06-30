import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { EventGateway } from '@/events/event.gateway'
import { HttpModule, HttpService } from '@nestjs/axios'
import { BullModule } from '@nestjs/bullmq'
import { forwardRef, Inject, MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AxiosError, AxiosResponse } from 'axios'
import { Agent } from 'https'
import { upperCase } from 'lodash'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { Logger } from 'winston'
import { OrderModule } from '../order/order.module'
import { BaseRFIDInventoryEntity } from '../rfid/entities/rifd-inventory.entity'
import { RFIDModule } from '../rfid/rfid.module'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { THIRD_PARTY_API_SYNC } from './constants'
import { ThirdPartyApiConsumer } from './queues/third-party-api.consumer'
import { ThirdPartyApiOAuth2Service } from './strategies/third-party-api-oauth2.service'
import { GL1OAuth2Strategy, GL3OAuth2Strategy, GL4OAuth2Strategy } from './strategies/third-party-api-oauth2.strategy'
import { ThirdPartyApiController } from './third-party-api.controller'
import { ThirdPartyApiMiddleware } from './third-party-api.middleware'
import { ThirdPartyApiService } from './third-party-api.service'

@Module({
	imports: [
		TenancyModule,
		OrderModule,
		TypeOrmModule.forFeature([BaseRFIDInventoryEntity], DATA_SOURCE_DATA_LAKE),
		HttpModule.register({ httpsAgent: new Agent({ keepAlive: true }) }),
		BullModule.registerQueue({
			name: THIRD_PARTY_API_SYNC,
			defaultJobOptions: { removeOnComplete: true }
		}),
		forwardRef(() => RFIDModule)
	],
	controllers: [ThirdPartyApiController],
	providers: [
		EventGateway,
		ThirdPartyApiService,
		ThirdPartyApiConsumer,
		ThirdPartyApiOAuth2Service,
		GL1OAuth2Strategy,
		GL3OAuth2Strategy,
		GL4OAuth2Strategy
	],
	exports: [HttpModule, ThirdPartyApiService, BullModule]
})
export class ThirdPartyApiModule implements NestModule, OnModuleInit {
	constructor(
		@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
		private readonly httpService: HttpService,
		private readonly configService: ConfigService
	) {}

	onModuleInit() {
		this.httpService.axiosRef.defaults.baseURL = this.configService.get('THIRD_PARTY_API_URL')
		this.httpService.axiosRef.interceptors.request.use(
			(config) => config,
			(error) => Promise.reject(error)
		)

		this.httpService.axiosRef.interceptors.response.use(
			<T>(response: AxiosResponse<T>) => {
				const requestMethod = upperCase(response.config.method)
				const requestURL = response.config.baseURL + response.config.url
				const errorStatus = response.status
				this.logger.log('info', `${requestMethod} ${requestURL} ${errorStatus}`)
				return response.data
			},
			(error: AxiosError) => {
				const requestMethod = upperCase(error.config.method)
				const requestURL = error.config.baseURL + error.config.url
				const errorStatus = error.status
				this.logger.error(`${requestMethod} ${requestURL} ${errorStatus}`)
				return Promise.reject(error)
			}
		)
	}

	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware, ThirdPartyApiMiddleware).forRoutes('/third-party-api/*')
	}
}
