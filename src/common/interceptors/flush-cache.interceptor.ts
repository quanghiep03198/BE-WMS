// flush-cache.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { InjectRedisClient } from '@redis/decorators'
import { Redis } from 'ioredis'
import { Observable } from 'rxjs'

export const FLUSH_CACHE_PATTERNS = 'flush_cache_patterns'

@Injectable()
export class FlushCacheInterceptor implements NestInterceptor {
	private readonly logger = new Logger(FlushCacheInterceptor.name)

	constructor(
		private readonly reflector: Reflector,
		@InjectRedisClient() private readonly redis: Redis
	) {}

	async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
		const patterns = this.reflector.getAllAndOverride<string[]>(FLUSH_CACHE_PATTERNS, [
			context.getHandler(),
			context.getClass()
		])

		if (patterns?.length && context.getType() === 'http') {
			await this.flushPatterns(patterns)
		}

		return next.handle()
	}

	private async flushPatterns(patterns: string[]) {
		for (const pattern of patterns) {
			try {
				const stream = this.redis.scanStream({ match: pattern, count: 100 })

				for await (const keys of stream as AsyncIterable<string[]>) {
					if (keys.length > 0) {
						await this.redis.unlink(...keys)
					}
				}
			} catch (error) {
				// Flush cache lỗi không được làm hỏng luồng chính
				this.logger.error(
					`Failed to flush cache pattern "${pattern}"`,
					error instanceof Error ? error.stack : String(error)
				)
			}
		}
	}
}
