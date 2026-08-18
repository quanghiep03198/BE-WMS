import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { DiscoveredCdcHandler } from './cdc-explorer.service'
import { CdcWatcherService } from './cdc-watcher.service'

@Injectable()
export class CdcSchedulerService implements OnModuleDestroy {
	private readonly logger = new Logger(CdcSchedulerService.name)
	private timers: NodeJS.Timeout[] = []

	constructor(private readonly watcher: CdcWatcherService) {}

	start(handlers: DiscoveredCdcHandler[]): void {
		for (const discovered of handlers) {
			const timer = setInterval(() => {
				this.watcher
					.watchTable(discovered)
					.catch((err) =>
						this.logger.error(
							`CDC error on ${discovered.options.dataSourceToken}.${discovered.options.sourceName}: ${err.message}`
						)
					)
			}, discovered.options.pollIntervalMs)
			this.timers.push(timer)
		}
		this.logger.log(`CDC scheduler started with ${handlers.length} table(s)`)
	}

	onModuleDestroy(): void {
		this.timers.forEach(clearInterval)
		this.timers = []
	}
}
