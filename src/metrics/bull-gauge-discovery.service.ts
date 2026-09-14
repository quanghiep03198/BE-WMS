// bullmq-gauge-discovery.service.ts
import { BULLMQ_JOBS_COUNTER, BULLMQ_JOBS_GAUGE } from '@configs/bullmq.config'
import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { DiscoveryService } from '@nestjs/core'
import { InjectMetric } from '@willsoto/nestjs-prometheus'
import { Queue, QueueEvents } from 'bullmq'
import { Gauge } from 'prom-client'

@Injectable()
export class BullmqGaugeDiscoveryService implements OnApplicationBootstrap, OnModuleDestroy {
	private queues: Queue[] = []
	private queueEventsList: QueueEvents[] = []
	private timer: NodeJS.Timeout

	constructor(
		private readonly discoveryService: DiscoveryService,
		@InjectMetric(BULLMQ_JOBS_GAUGE) private readonly gauge: Gauge<string>,
		@InjectMetric(BULLMQ_JOBS_COUNTER) private readonly counter: Gauge<string>
	) {}

	/**
	 * Scan all providers in the DI container and filter out instances of `bullmq.Queue`
	 */
	onApplicationBootstrap() {
		this.queues = this.discoveryService
			.getProviders()
			.map((wrapper) => wrapper.instance)
			.filter((instance): instance is Queue => instance instanceof Queue)

		for (const queue of this.queues) {
			const events = new QueueEvents(queue.name, { connection: queue.opts.connection })
			events.on('completed', () => this.counter.inc({ queue: queue.name, status: 'completed' }))
			events.on('failed', () => this.counter.inc({ queue: queue.name, status: 'failed' }))
			events.on('error', () => this.counter.inc({ queue: queue.name, status: 'error' }))
			this.queueEventsList.push(events)
		}

		this.timer = setInterval(() => this.poll(), 5000)
	}

	private async poll() {
		for (const queue of this.queues) {
			const counts = await queue.getJobCounts(
				'waiting',
				'active',
				'delayed',
				'paused',
				'prioritized',
				'completed',
				'failed'
			)
			for (const [state, value] of Object.entries(counts)) {
				this.gauge.set({ queue: queue.name, state }, value)
			}
		}
	}

	onModuleDestroy() {
		clearInterval(this.timer)
	}
}
