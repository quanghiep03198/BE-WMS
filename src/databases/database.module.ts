import { TransactionRegistry } from '@/common/stores/transaction.registry'
import { DynamicModule, Module, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose'
import { TypeOrmModule, TypeOrmModuleAsyncOptions } from '@nestjs/typeorm'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import {
	CENTRAL_DATA_SOURCE,
	DATA_SOURCE_DATA_LAKE,
	DATA_SOURCE_ERP,
	DATA_SOURCE_SYSCLOUD,
	DATABASE_DATA_LAKE,
	DATABASE_ERP,
	DATABASE_SYSCLOUD
} from './constants'

@Module({
	imports: [
		// * MSSQL Server
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_DATA_LAKE,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					database: DATABASE_DATA_LAKE,
					...configService.getOrThrow<TypeOrmModuleAsyncOptions>('mssql')
				}
			},
			dataSourceFactory: async (options) => {
				const dataSource = new DataSource(options)

				await dataSource.initialize()

				TransactionRegistry.register(DATA_SOURCE_DATA_LAKE, dataSource)

				return dataSource
			}
		}),
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_SYSCLOUD,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					database: DATABASE_SYSCLOUD,
					...configService.getOrThrow<TypeOrmModuleAsyncOptions>('mssql')
				}
			}
		}),
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_ERP,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					database: DATABASE_ERP,
					...configService.getOrThrow<TypeOrmModuleAsyncOptions>('mssql')
				}
			}
		}),

		// * MongoDB
		MongooseModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => configService.getOrThrow<MongooseModuleOptions>('mongodb')
		})
	]
})
export class DatabaseModule {
	static forRootAsync(): DynamicModule {
		return {
			module: DatabaseModule,
			global: true,
			providers: [
				{
					provide: CENTRAL_DATA_SOURCE,
					scope: Scope.DEFAULT,
					inject: [ConfigService],
					useFactory: async (configService: ConfigService) => {
						const dataSource = new DataSource({
							...configService.getOrThrow<SqlServerConnectionOptions>('mssql'),
							host: configService.getOrThrow<string>('TENANT_CENTRAL'),
							entities: [join(__dirname, '../**/*.entity.{ts,js}')]
						})
						if (!dataSource.isInitialized) await dataSource.initialize()
						return dataSource
					}
				}
			],
			exports: [CENTRAL_DATA_SOURCE]
		}
	}
}
