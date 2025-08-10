import { DatabaseModule } from '@/databases'
import { BullModule } from '@nestjs/bullmq'
import { CacheModule } from '@nestjs/cache-manager'
import { Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule } from '@nestjs/throttler'
import * as Sentry from '@sentry/nestjs'
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup'
import { PrometheusModule } from '@willsoto/nestjs-prometheus'
import { AcceptLanguageResolver, HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n'
import { LoggerModule, Params } from 'nestjs-pino'
import { AppController } from './app.controller'
import { appConfigFactory, validateConfig } from './configs'
import { RotateLogJob } from './jobs/rotate-log.job'
// Feature modules
import { EventGateway } from './events/event.gateway'
import { AuthModule } from './modules/auth/auth.module'
import { DepartmentModule } from './modules/department/department.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { OrderModule } from './modules/order/order.module'
import { PackingModule } from './modules/packing/packing.module'
import { ReportModule } from './modules/report/report.module'
import { RFIDModule } from './modules/rfid/rfid.module'
import { TenancyModule } from './modules/tenancy/tenancy.module'
import { ThirdPartyApiModule } from './modules/third-party-api/third-party-api.module'
import { UserModule } from './modules/user/user.module'
import { WarehouseModule } from './modules/warehouse/warehouse.module'
import { RedisModule } from './redis/redis.module'

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
		DatabaseModule.forRootAsync(),
		RedisModule.forRoot(),
		SentryModule.forRoot(),
		ScheduleModule.forRoot(),
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
		RFIDModule,
		TenancyModule,
		ThirdPartyApiModule,
		InventoryModule,
		UserModule,
		WarehouseModule
	],
	controllers: [AppController],
	providers: [
		EventGateway,
		RotateLogJob,
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
