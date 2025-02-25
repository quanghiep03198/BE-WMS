import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleDestroy } from '@nestjs/common'
import { Redis } from 'ioredis'
import { REDIS_PUBLISHER, REDIS_SUBSCRIBER } from './constants'

@Injectable()
export class IoRedisService implements OnModuleDestroy, OnApplicationShutdown {
	private readonly logger = new Logger(IoRedisService.name)

	constructor(
		@Inject(REDIS_PUBLISHER) private readonly publisher: Redis,
		@Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis
	) {}

	onModuleDestroy() {
		this.publisher.quit()
		this.subscriber.quit()
	}

	onApplicationShutdown() {
		this.publisher.quit()
		this.subscriber.quit()
	}

	async publish(channel: string, message: string): Promise<void> {
		this.publisher.publish(channel, message)
	}

	async subscribe(subcribedChannel: string, callback: (msg: string) => void): Promise<void> {
		this.subscriber.subscribe(subcribedChannel, (error) => {
			if (error) this.logger.error(error)
		})
		this.subscriber.on('message', (channel, message) => {
			if (channel === subcribedChannel) {
				callback(message)
			}
		})
	}

	async unsubscribe(channel: string): Promise<void> {
		this.subscriber.unsubscribe(channel)
	}
}
