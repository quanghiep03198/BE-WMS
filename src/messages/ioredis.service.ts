import { Injectable, Logger, OnApplicationShutdown, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Redis } from 'ioredis'

@Injectable()
export class IoRedisService implements OnModuleDestroy, OnApplicationShutdown {
	private readonly publisher: Redis
	private readonly subscriber: Redis
	private readonly logger: Logger

	constructor(private readonly configService: ConfigService) {
		this.publisher = new Redis({
			host: this.configService.get('REDIS_HOST'),
			port: this.configService.get('REDIS_PORT'),
			password: this.configService.get('REDIS_PASSWORD')
		})
		this.subscriber = new Redis({
			host: this.configService.get('REDIS_HOST'),
			port: this.configService.get('REDIS_PORT'),
			password: this.configService.get('REDIS_PASSWORD')
		})
		this.logger = new Logger(IoRedisService.name)
	}

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

	async subscribe(channel: string, callback: (msg: string) => void): Promise<void> {
		this.subscriber.subscribe(channel, (error) => {
			if (error) this.logger.error(error)
		})
		this.subscriber.on('message', (_channel, message) => {
			if (_channel === channel) {
				callback(message)
			}
		})
	}

	async unsubscribe(channel: string): Promise<void> {
		this.subscriber.unsubscribe(channel)
	}
}
