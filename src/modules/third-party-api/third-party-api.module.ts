import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { HttpModule, HttpService } from '@nestjs/axios'
import { BullModule } from '@nestjs/bullmq'
import { forwardRef, MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AxiosError, AxiosResponse } from 'axios'
import { upperCase } from 'lodash'
import { PinoLogger } from 'nestjs-pino'
import { Agent } from 'node:https'
import { FactoryCode } from '../department/constants'
import { BaseRFIDInventoryEntity } from '../inoutbound/infrastructure/persistence/mssql/entities/rfid-inventory.entity'
import { InoutboundModule } from '../inoutbound/inoutbound.module'
import { OrderModule } from '../order/order.module'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { DECKERS_OAUTH2_STRATEGY, THIRD_PARTY_API_SYNC } from './constants'
import { ThirdPartyApiConsumer } from './queues/third-party-api.consumer'
import { DeckersOAuth2Strategy } from './strategies/deckers-oauth2.strategy'
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
			defaultJobOptions: { removeOnComplete: true, removeOnFail: true }
		}),
		forwardRef(() => InoutboundModule)
	],
	controllers: [ThirdPartyApiController],
	providers: [
		ThirdPartyApiService,
		ThirdPartyApiConsumer,
		DeckersOAuth2Strategy,
		{
			provide: DECKERS_OAUTH2_STRATEGY,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) =>
				new Map<FactoryCode, Record<'client_id' | 'client_secret', string>>([
					[
						FactoryCode.GL1,
						{
							client_id: configService.get('DECKERS_GL1_CLIENT_ID'),
							client_secret: configService.get('DECKERS_GL1_CLIENT_SECRET')
						}
					],
					[
						FactoryCode.GL3,
						{
							client_id: configService.get('DECKERS_GL3_CLIENT_ID'),
							client_secret: configService.get('DECKERS_GL3_CLIENT_SECRET')
						}
					],
					[
						FactoryCode.GL4,
						{
							client_id: configService.get('DECKERS_GL4_CLIENT_ID'),
							client_secret: configService.get('DECKERS_GL4_CLIENT_SECRET')
						}
					]
				])
		}
	],
	exports: [HttpModule, ThirdPartyApiService, BullModule]
})
export class ThirdPartyApiModule implements NestModule, OnModuleInit {
	constructor(
		private readonly logger: PinoLogger,
		private readonly httpService: HttpService,
		private readonly configService: ConfigService
	) {}

	onModuleInit() {
		this.httpService.axiosRef.defaults.baseURL = this.configService.get('DECKERS_API_URL')
		this.httpService.axiosRef.interceptors.request.use(
			(config) => config,
			(error) => Promise.reject(error)
		)

		this.httpService.axiosRef.interceptors.response.use(
			<T>(response: AxiosResponse<T>) => {
				const requestMethod = upperCase(response.config.method)
				const requestURL = response.config.baseURL + response.config.url
				const errorStatus = response.status
				this.logger.info(`${requestMethod} ${requestURL} ${errorStatus}`)
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
		consumer.apply(TenacyMiddleware, ThirdPartyApiMiddleware).forRoutes(ThirdPartyApiController)
	}
}
