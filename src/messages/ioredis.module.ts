import { DynamicModule, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisOptions } from 'ioredis'
import { REDIS_PUBLISHER, REDIS_SUBSCRIBER } from './constants'
import { IoRedisService } from './ioredis.service'

@Module({
	providers: [IoRedisService],
	exports: [IoRedisService]
})
export class IoRedisModule {
	static forRoot(): DynamicModule {
		return {
			global: true,
			module: IoRedisModule,
			providers: [
				IoRedisService,
				{
					provide: REDIS_PUBLISHER,
					inject: [ConfigService],
					useFactory: (configService: ConfigService): RedisOptions => ({
						host: configService.get('REDIS_HOST'),
						port: +configService.get('REDIS_PORT'),
						password: configService.get('REDIS_PASSWORD')
					})
				},
				{
					provide: REDIS_SUBSCRIBER,
					inject: [ConfigService],
					useFactory: (configService: ConfigService): RedisOptions => ({
						host: configService.get('REDIS_HOST'),
						port: +configService.get('REDIS_PORT'),
						password: configService.get('REDIS_PASSWORD')
					})
				}
			],
			exports: [IoRedisService]
		}
	}
}
