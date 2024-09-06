import { Module, OnModuleInit } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AcceptLanguageResolver, HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n'
import { internalConfigs, validateConfig } from './configs/app.config'
import { DatabaseModule } from './databases/database.module'
import { DynamicDataSourceService } from './modules/_shared/dynamic-datasource.service'
// Feature modules
import { CacheModule, CacheOptions } from '@nestjs/cache-manager'
import { RedisClientOptions } from 'redis'
import { FileLogger } from './common/helpers/file-logger.helper'
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
			load: [internalConfigs],
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
		CacheModule.registerAsync({
			isGlobal: true,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) =>
				configService.getOrThrow<CacheOptions<RedisClientOptions>>('cache')
		}),
		DatabaseModule,
		// * Feature modules
		AuthModule,
		UserModule,
		WarehouseModule,
		RFIDModule,
		DepartmentModule
	],
	controllers: [],
	providers: [DynamicDataSourceService]
})
export class AppModule implements OnModuleInit {
	onModuleInit() {
		FileLogger.initialize()
	}
}
