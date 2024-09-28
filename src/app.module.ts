import { Module, OnModuleInit } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AcceptLanguageResolver, HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n'
import { DatabaseModule } from './databases/database.module'
// Feature modules
import { CacheModule, CacheOptions } from '@nestjs/cache-manager'
import { ThrottlerModule } from '@nestjs/throttler'
import { RedisClientOptions } from 'redis'
import { AppController } from './app.controller'
import { FileLogger } from './common/helpers/file-logger.helper'
import { appConfigFactory } from './configs/app.config'
import { validateConfig } from './configs/app.config.validator'
import { AuthModule } from './modules/auth/auth.module'
import { DepartmentModule } from './modules/department/department.module'
import { RFIDModule } from './modules/rfid/rfid.module'
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
			useFactory: (configService: ConfigService) => {
				return configService.getOrThrow<CacheOptions<RedisClientOptions>>('cache')
			}
		}),
		ThrottlerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => configService.getOrThrow('throttler')
		}),
		DatabaseModule,
		// * Feature modules
		AuthModule,
		UserModule,
		WarehouseModule,
		RFIDModule,
		DepartmentModule
	],
	controllers: [AppController],
	providers: []
})
export class AppModule implements OnModuleInit {
	onModuleInit() {
		FileLogger.initialize()
	}
}
