import { Logger, Module, OnModuleInit } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { redisStore } from 'cache-manager-redis-store'
import { AcceptLanguageResolver, CookieResolver, HeaderResolver, I18nModule, QueryResolver } from 'nestjs-i18n'
import path from 'path'
import { configValidator } from './configs/app.config'
import { DatabaseModule } from './databases/database.module'
import { DynamicDataSourceService } from './modules/_shared/services/dynamic-datasource.service'
// Feature modules
import { CacheModule, CacheStore } from '@nestjs/cache-manager'
import { RedisClientOptions } from 'redis'
import { FileLogger } from './common/helpers/file-logger.helper'
import { AuthModule } from './modules/auth/auth.module'
import { DepartmentModule } from './modules/department/department.module'
import { RFIDModule } from './modules/rfid/rfid.module'
import { UserModule } from './modules/user/user.module'
import { WarehouseModule } from './modules/warehouse/warehouse.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			envFilePath: '.env',
			isGlobal: true,
			load: [],
			validate: (env) =>
				configValidator
					.parseAsync(env)
					.then((env) => env)
					.catch((error) => Logger.error(error))
		}),
		I18nModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: async (configService: ConfigService) => {
				return {
					fallbackLanguage: configService.get('FALLBACK_LANGUAGE'),
					loaderOptions: {
						path: path.join(__dirname, '/i18n/'),
						watch: true
					},
					typesOutputPath: path.join(__dirname, '../src/generated/i18n.generated.ts'),
					resolvers: [
						{ use: QueryResolver, options: ['lang'] },
						new HeaderResolver(['Accept-Language']),
						new CookieResolver(),
						AcceptLanguageResolver
					]
				}
			}
		}),
		CacheModule.registerAsync<RedisClientOptions>({
			isGlobal: true,
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: async (configService: ConfigService) => {
				return {
					store: redisStore as unknown as CacheStore,
					socket: {
						host: configService.get('REDIS_HOST'),
						port: Number(configService.get('REDIS_PORT'))
					},
					max: 1000
				}
			}
		}),
		DatabaseModule,
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
