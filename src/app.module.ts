import { DatabaseModule } from '@/databases'
import { ClsPluginTransactional } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm'
import { BullModule } from '@nestjs/bullmq'
import { CacheModule } from '@nestjs/cache-manager'
import { Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule } from '@nestjs/throttler'
import { getDataSourceToken } from '@nestjs/typeorm'
import * as Sentry from '@sentry/nestjs'
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup'
import { PrometheusModule } from '@willsoto/nestjs-prometheus'
import { ClsModule } from 'nestjs-cls'
import { AcceptLanguageResolver, HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n'
import { LoggerModule, Params } from 'nestjs-pino'
import { AppController } from './app.controller'
import { appConfigFactory, validateConfig } from './configs'
// Feature modules
import { EventGateway } from './events/event.gateway'
import { AuthModule } from './modules/auth/auth.module'
import { DefectiveGoodsModule } from './modules/defective-goods/defective-goods.module'
import { DepartmentModule } from './modules/department/department.module'
import { InoutboundModule } from './modules/inoutbound/inoutbound.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { OrderModule } from './modules/order/order.module'
import { PackingModule } from './modules/packing/packing.module'
import { ProductSpecificationModule } from './modules/product-specification/product-specification.module'
import { ReportModule } from './modules/report/report.module'
import { StatisticModule } from './modules/statistic/statistic.module'
import { TenancyModule } from './modules/tenancy/tenancy.module'
import { ThirdPartyApiModule } from './modules/third-party-api/third-party-api.module'
import { TruckloadDeliveryModule } from './modules/truckload-delivery/truckload-delivery.module'
import { UserModule } from './modules/user/user.module'
import { WarehouseModule } from './modules/warehouse/warehouse.module'
import { RedisModule } from './redis/redis.module'
// Schedule Tasks
import { getConnectionToken } from '@nestjs/mongoose'
import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP, DATA_SOURCE_SYSCLOUD } from './databases/constants'
import { RFIDDeviceModule } from './modules/rfid-device/rfid-device.module'
import { ScheduleTasks } from './tasks'

@Module({
	imports: [
		// * Core modules
		PrometheusModule.registerAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				global: true,
				path: '/metrics',
				defaultMetrics: {
					enabled: configService.get<RuntimeEnvironment>('NODE_ENV') === 'production'
				}
			})
		}),
		LoggerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => configService.getOrThrow<Params>('logger')
		}),
		ConfigModule.forRoot({
			envFilePath: ['.env'],
			isGlobal: true,
			load: [appConfigFactory],
			validate: validateConfig
		}),
		CqrsModule.forRoot(),
		DatabaseModule.forRootAsync(),
		RedisModule.forRoot(),
		SentryModule.forRoot(),
		ScheduleModule.forRoot(),
		ClsModule.forRoot({
			plugins: [
				new ClsPluginTransactional({
					imports: [DatabaseModule],
					connectionName: DATA_SOURCE_DATA_LAKE,
					adapter: new TransactionalAdapterTypeOrm({
						dataSourceToken: getDataSourceToken(DATA_SOURCE_DATA_LAKE)
					})
				}),
				new ClsPluginTransactional({
					imports: [DatabaseModule],
					connectionName: DATA_SOURCE_SYSCLOUD,
					adapter: new TransactionalAdapterTypeOrm({
						dataSourceToken: getDataSourceToken(DATA_SOURCE_SYSCLOUD)
					})
				}),
				new ClsPluginTransactional({
					imports: [DatabaseModule],
					connectionName: DATA_SOURCE_ERP,
					adapter: new TransactionalAdapterTypeOrm({
						dataSourceToken: getDataSourceToken(DATA_SOURCE_ERP)
					})
				}),
				new ClsPluginTransactional({
					imports: [DatabaseModule],
					adapter: new TransactionalAdapterMongoose({
						mongooseConnectionToken: getConnectionToken()
					})
				})
			]
		}),
		I18nModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => configService.getOrThrow('i18n'),
			resolvers: [
				{ use: QueryResolver, options: ['lng'] },
				new HeaderResolver(['X-Language']),
				AcceptLanguageResolver
			]
		}),
		CacheModule.registerAsync({
			isGlobal: true,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => configService.getOrThrow('cache')
		}),
		ThrottlerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => configService.getOrThrow('throttler')
		}),
		BullModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => configService.getOrThrow('bullmq')
		}),
		EventEmitterModule.forRoot({
			wildcard: false, // cho phép sử dụng các ký tự đại diện (wildcards) trong tên sự kiện. Ví dụ: (user.login, user.logout, user.signup) => wildcard = user.*.
			delimiter: '.',
			newListener: false,
			removeListener: true,
			maxListeners: 10,
			verboseMemoryLeak: true,
			ignoreErrors: false
		}),

		// * Feature modules
		AuthModule,
		DepartmentModule,
		OrderModule,
		PackingModule,
		ReportModule,
		InoutboundModule,
		TenancyModule,
		ThirdPartyApiModule,
		InventoryModule,
		UserModule,
		WarehouseModule,
		DefectiveGoodsModule,
		ProductSpecificationModule,
		StatisticModule,
		TruckloadDeliveryModule,
		RFIDDeviceModule
	],
	controllers: [AppController],
	providers: [
		...ScheduleTasks,
		EventGateway,
		{
			provide: APP_FILTER,
			useClass: SentryGlobalFilter
		}
	]
})
export class AppModule implements OnApplicationBootstrap, OnApplicationShutdown {
	onApplicationBootstrap() {
		Sentry.profiler.startProfiler()
	}
	onApplicationShutdown() {
		Sentry.profiler.stopProfiler()
	}
}
