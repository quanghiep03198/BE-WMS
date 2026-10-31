import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { setTimeout as sleep, setImmediate as yieldToEventLoop } from 'node:timers/promises'
import { DiscoveredCdcHandler } from './cdc-explorer.service'
import { type CdcPollOutcome, CdcWatcherService } from './cdc-watcher.service'

/** Thời gian chờ tối đa giữa hai lượt poll khi liên tục lỗi. */
const MAX_BACKOFF_MS = 30_000

/**
 * Mỗi bảng CDC có một vòng lặp riêng, chạy tuần tự: poll xong mới tính đến lượt kế tiếp.
 * - Còn backlog ('more'): poll tiếp ngay (nhường event loop một nhịp).
 * - Hết dữ liệu hoặc bảng đang bận: chờ pollIntervalMs.
 * - Lỗi: chờ lâu dần (backoff) tới tối đa MAX_BACKOFF_MS, thành công thì về nhịp bình thường.
 */
@Injectable()
export class CdcSchedulerService implements OnModuleDestroy {
	private readonly logger = new Logger(CdcSchedulerService.name)
	private readonly abort = new AbortController()
	private loops: Promise<void>[] = []

	constructor(private readonly watcher: CdcWatcherService) {}

	start(handlers: DiscoveredCdcHandler[]): void {
		if (this.loops.length > 0) return // đã start rồi
		this.loops = handlers.map((discovered) => this.run(discovered))
		this.logger.log(`CDC scheduler started with ${handlers.length} table(s)`)
	}

	/** Cần app.enableShutdownHooks() để hook này chạy khi nhận SIGTERM/SIGINT. */
	async onModuleDestroy(): Promise<void> {
		this.abort.abort()
		await Promise.allSettled(this.loops) // đợi lượt poll đang chạy dừng gọn (watcher kiểm tra signal giữa các batch)
		this.loops = []
	}

	private async run(discovered: DiscoveredCdcHandler): Promise<void> {
		const { dataSourceToken, sourceName, pollIntervalMs } = discovered.options
		const { signal } = this.abort
		let failures = 0

		// Lệch pha ban đầu để các bảng không cùng poll một lúc.
		await this.wait(Math.random() * pollIntervalMs)

		while (!signal.aborted) {
			let outcome: CdcPollOutcome = 'error'
			try {
				outcome = await this.watcher.watchTable(discovered, signal)
			} catch (err) {
				this.logger.error(
					`CDC error on ${dataSourceToken}.${sourceName}: ${err instanceof Error ? err.message : String(err)}`
				)
			}

			failures = outcome === 'error' ? failures + 1 : 0

			if (outcome === 'more') {
				await yieldToEventLoop()
			} else if (outcome === 'error') {
				await this.wait(Math.min(pollIntervalMs * 2 ** Math.min(failures, 5), MAX_BACKOFF_MS))
			} else {
				await this.wait(pollIntervalMs)
			}
		}
	}

	private async wait(ms: number): Promise<void> {
		try {
			await sleep(ms, undefined, { signal: this.abort.signal })
		} catch {
			// bị hủy khi shutdown
		}
	}
}
