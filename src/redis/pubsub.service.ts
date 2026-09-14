import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import { Redis } from 'ioredis'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { InjectPublisher, InjectSubscriber } from './decorators'

@Injectable()
export class PubSubService implements OnApplicationShutdown {
	constructor(
		@InjectPublisher() private readonly publisher: Redis,
		@InjectSubscriber() private readonly subscriber: Redis,
		@InjectPinoLogger(PubSubService.name) private readonly logger: PinoLogger
	) {}

	async onApplicationShutdown() {
		// * Only close connections that are still active to avoid "Connection is closed" errors
		await Promise.allSettled(
			[this.publisher, this.subscriber].filter((client) => client.status !== 'end').map((client) => client.quit())
		)
	}

	async publish(channel: string, message: string): Promise<number> {
		try {
			const result = await this.publisher.publish(channel, message)
			this.logger.info(`Published message to channel ${channel}`)
			return result
		} catch (error) {
			this.logger.error(`Failed to publish message to channel ${channel}: ${(error as Error).message}`)
		}
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

	async unsubscribe(channel: string): Promise<unknown> {
		try {
			const result = await this.subscriber.unsubscribe(channel)
			this.logger.info(`Unsubscribed from channel ${channel}`)
			return result
		} catch (error) {
			this.logger.error(`Failed to unsubscribe from channel ${channel}: ${(error as Error).message}`)
		}
	}
}
