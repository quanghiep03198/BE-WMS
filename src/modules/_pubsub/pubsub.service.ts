import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Redis } from 'ioredis'

@Injectable()
export class PubSubService implements OnModuleDestroy {
	private publisher: Redis
	private subscriber: Redis

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
	}

	onModuleDestroy() {
		this.publisher.quit()
		this.subscriber.quit()
	}

	async publish(channel: string, message: string): Promise<void> {
		this.publisher.publish(channel, message)
	}

	async subscribe(channel: string, callback: (msg: string) => void): Promise<void> {
		this.subscriber.subscribe(channel, (error) => {
			if (error) console.log(error)
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
