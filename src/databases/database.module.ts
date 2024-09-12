import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule, TypeOrmModuleAsyncOptions } from '@nestjs/typeorm'
import {
	DATA_SOURCE_ERP,
	DATA_SOURCE_SYSCLOUD,
	DATABASE_DATA_LAKE,
	DATABASE_ERP,
	DATABASE_SYSCLOUD,
	DATASOURCE_DATA_LAKE
} from './constants'

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			name: DATASOURCE_DATA_LAKE,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					database: DATABASE_DATA_LAKE,
					...configService.getOrThrow<TypeOrmModuleAsyncOptions>('database')
				}
			}
		}),
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_SYSCLOUD,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					database: DATABASE_SYSCLOUD,
					...configService.getOrThrow<TypeOrmModuleAsyncOptions>('database')
				}
			}
		}),
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_ERP,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					database: DATABASE_ERP,
					...configService.getOrThrow<TypeOrmModuleAsyncOptions>('database')
				}
			}
		})
	]
})
export class DatabaseModule {}
