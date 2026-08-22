import { DynamicModule, Module, OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { CacheService } from './cache.service'
import { REDIS_CLIENT, REDIS_PUBLISHER, REDIS_SUBSCRIBER } from './constants'
import { InjectRedisClient } from './decorators'
import { PubSubService } from './pubsub.service'

@Module({
	providers: [
		{
			provide: REDIS_PUBLISHER,
			inject: [ConfigService],
			useFactory: (configService: ConfigService): Redis =>
				new Redis({
					host: configService.get('REDIS_HOST'),
					port: +configService.get('REDIS_PORT'),
					password: configService.get('REDIS_PASSWORD')
				})
		},
		{
			provide: REDIS_SUBSCRIBER,
			inject: [REDIS_PUBLISHER],
			useFactory: (publisher: Redis): Redis => publisher.duplicate()
		}
	]
})
export class RedisModule implements OnApplicationShutdown {
	constructor(@InjectRedisClient() private readonly redisClient: Redis) {}

	static forRoot(): DynamicModule {
		return {
			global: true,
			module: RedisModule,
			providers: [
				PubSubService,
				CacheService,
				{
					provide: REDIS_CLIENT,
					inject: [ConfigService],
					useFactory: (configService: ConfigService): Redis => {
						return new Redis({
							host: configService.get('REDIS_HOST'),
							port: +configService.get('REDIS_PORT'),
							password: configService.get('REDIS_PASSWORD'),
							db: +configService.get('REDIS_DB', '0')
						})
					}
				}
			],
			exports: [PubSubService, CacheService, REDIS_CLIENT]
		}
	}

	async onApplicationShutdown() {
		await this.redisClient.disconnect()
	}
}
