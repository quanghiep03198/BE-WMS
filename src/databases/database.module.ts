import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose'
import { TypeOrmModule, TypeOrmModuleAsyncOptions } from '@nestjs/typeorm'
import {
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
export class DatabaseModule {}
