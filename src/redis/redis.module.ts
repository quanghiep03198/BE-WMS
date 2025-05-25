import { DynamicModule, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { REDIS_CLIENT, REDIS_PUBLISHER, REDIS_SUBSCRIBER } from './constants'
import { RedisService } from './redis.service'

@Module({
	providers: [
		{
			provide: REDIS_PUBLISHER,
			inject: [ConfigService],
			useFactory: (configService: ConfigService): Redis => {
				return new Redis({
					host: configService.get('REDIS_HOST'),
					port: +configService.get('REDIS_PORT'),
					password: configService.get('REDIS_PASSWORD')
				})
			}
		},
		{
			provide: REDIS_SUBSCRIBER,
			inject: [ConfigService],
			useFactory: (configService: ConfigService): Redis => {
				return new Redis({
					host: configService.get('REDIS_HOST'),
					port: +configService.get('REDIS_PORT'),
					password: configService.get('REDIS_PASSWORD')
				})
			}
		}
	]
})
export class RedisModule {
	static forRoot(): DynamicModule {
		return {
			global: true,
			module: RedisModule,
			providers: [
				RedisService,
				{
					provide: REDIS_CLIENT,
					inject: [ConfigService],
					useFactory: (configService: ConfigService): Redis => {
						return new Redis({
							host: configService.get('REDIS_HOST'),
							port: +configService.get('REDIS_PORT'),
							password: configService.get('REDIS_PASSWORD')
						})
					}
				}
			],
			exports: [RedisService, REDIS_CLIENT]
		}
	}
}
