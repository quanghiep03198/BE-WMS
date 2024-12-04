import { Module, OnModuleInit } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AcceptLanguageResolver, HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n'
import { DatabaseModule } from './databases/database.module'
// Feature modules
import { CacheModule } from '@nestjs/cache-manager'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ThrottlerModule } from '@nestjs/throttler'
import { RedisClientOptions } from 'redis'
import { AppController } from './app.controller'
import { FileLogger } from './common/helpers/file-logger.helper'
import { appConfigFactory } from './configs/app.config'
import { validateConfig } from './configs/app.config.validator'
import { AuthModule } from './modules/auth/auth.module'
import { DepartmentModule } from './modules/department/department.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { OrderModule } from './modules/order/order.module'
import { PackingModule } from './modules/packing/packing.module'
import { RFIDModule } from './modules/rfid/rfid.module'
import { TenancyModule } from './modules/tenancy/tenancy.module'
import { ThirdPartyApiModule } from './modules/third-party-api/third-party-api.module'
import { UserModule } from './modules/user/user.module'
import { WarehouseModule } from './modules/warehouse/warehouse.module'

@Module({
	imports: [
		// * Core modules
		ConfigModule.forRoot({
			envFilePath: ['.env'],
			isGlobal: true,
			load: [appConfigFactory],
			validate: validateConfig
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
		CacheModule.registerAsync<RedisClientOptions>({
			isGlobal: true,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => configService.getOrThrow('cache')
		}),
		ThrottlerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => configService.getOrThrow('throttler')
		}),
		EventEmitterModule.forRoot({
			wildcard: false,
			delimiter: '.',
			newListener: false,
			removeListener: false,
			maxListeners: 10,
			verboseMemoryLeak: false,
			ignoreErrors: false
		}),
		DatabaseModule,
		// * Feature modules
		AuthModule,
		UserModule,
		TenancyModule,
		ThirdPartyApiModule,
		WarehouseModule,
		RFIDModule,
		PackingModule,
		DepartmentModule,
		OrderModule,
		InventoryModule
		// ReportModule
	],
	controllers: [AppController],
	providers: []
})
export class AppModule implements OnModuleInit {
	onModuleInit() {
		FileLogger.initialize()
	}
}
