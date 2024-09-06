import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule, TypeOrmModuleAsyncOptions } from '@nestjs/typeorm'
import {
	DATA_LAKE_CONNECTION,
	DATABASE_DATA_LAKE,
	DATABASE_ERP,
	DATABASE_SYSCLOUD,
	ERP_CONNECTION,
	SYSCLOUD_CONNECTION
} from './constants'

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			name: DATA_LAKE_CONNECTION,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					database: DATABASE_DATA_LAKE,
					...configService.getOrThrow<TypeOrmModuleAsyncOptions>('database')
				}
			}
		}),
		TypeOrmModule.forRootAsync({
			name: SYSCLOUD_CONNECTION,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					database: DATABASE_SYSCLOUD,
					...configService.getOrThrow<TypeOrmModuleAsyncOptions>('database')
				}
			}
		}),
		TypeOrmModule.forRootAsync({
			name: ERP_CONNECTION,
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
