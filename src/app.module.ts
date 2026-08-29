import { ClsPluginTransactional } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm'
import { BullModule } from '@nestjs/bullmq'
import { CacheModule } from '@nestjs/cache-manager'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule } from '@nestjs/throttler'
import { getDataSourceToken } from '@nestjs/typeorm'
import { PrometheusModule } from '@willsoto/nestjs-prometheus'
import { ClsModule } from 'nestjs-cls'
import { AcceptLanguageResolver, HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n'
import { LoggerModule, Params } from 'nestjs-pino'
import { AppController } from './app.controller'
import { AppConfig } from './configs/index'
// Feature modules
import { AuthModule } from './modules/auth/auth.module'
import { DefectiveGoodsModule } from './modules/defective-goods/defective-goods.module'
import { DepartmentModule } from './modules/department/department.module'
import { FinishedGoodsModule } from './modules/finished-goods/finished-goods.module'
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
import { AllExceptionsFilter } from '@common/filters'
import { getConnectionToken } from '@nestjs/mongoose'
import { createObserveModule, ObserveOptions } from '@nestjs/observe'
import { CdcModule, DatabaseModule } from './databases'
import {
	DATA_SOURCE_DATA_LAKE,
	DATA_SOURCE_ERP,
	DATA_SOURCE_SYSCLOUD,
	DATA_WAREHOUSE_CONNECTION
} from './databases/constants'
import { RFIDDeviceModule } from './modules/rfid-device/rfid-device.module'
import { ScheduleTasks } from './tasks'

export const { ObserveModule, ObserveInstrument } = createObserveModule()

@Module({
	imports: [
		ObserveModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => configService.getOrThrow<ObserveOptions>('observe')
		}),
		// * Core modules
		PrometheusModule.registerAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				console.log(
					'ENABLE_PROMETHEUS_METRICS_LOGGER type :>>> ',
					typeof configService.get<boolean>('ENABLE_PROMETHEUS_METRICS_LOGGER')
				)

				return {
					global: true,
					path: '/metrics',
					defaultMetrics: {
						enabled: configService.get<boolean>('ENABLE_PROMETHEUS_METRICS_LOGGER')
					}
				}
			}
		}),
		LoggerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => configService.getOrThrow<Params>('logger')
		}),
		ConfigModule.forRoot({
			envFilePath: ['.env'],
			isGlobal: true,
			load: AppConfig.load(),
			cache: true,
			validate: AppConfig.validate
		}),
		CqrsModule.forRoot(),
		RedisModule.forRoot(),
		DatabaseModule,
		CdcModule.registerAsync({
			inject: [ConfigService],
			useFactory: (configService) => configService.getOrThrow('cdc')
		}),
		// SentryModule.forRoot(),
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
					connectionName: DATA_WAREHOUSE_CONNECTION,
					adapter: new TransactionalAdapterMongoose({
						mongooseConnectionToken: getConnectionToken(DATA_WAREHOUSE_CONNECTION)
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
		FinishedGoodsModule,
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
		{
			provide: APP_FILTER,
			useClass: AllExceptionsFilter
		}
	]
})
export class AppModule {}
