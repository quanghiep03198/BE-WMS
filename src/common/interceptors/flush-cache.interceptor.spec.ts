import { CallHandler, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host'
import { Redis } from 'ioredis'
import ScanStream from 'ioredis/built/ScanStream'
import { EventEmitter } from 'node:events'
import { setImmediate } from 'node:timers/promises'
import { firstValueFrom, of } from 'rxjs'
import { FLUSH_CACHE_PATTERNS, FlushCacheInterceptor } from './flush-cache.interceptor'

describe(FlushCacheInterceptor.name, () => {
	it('waits for Redis to delete matching keys before invoking the handler', async () => {
		const cachedKeys = new Set(['inventory:total', 'orders:total'])
		const redis = new Redis({ lazyConnect: true })
		jest.spyOn(redis, 'scanStream').mockImplementation(({ match } = {}) => {
			const stream = new ScanStream({ objectMode: true, command: 'scan', redis })
			stream.push(match === 'inventory:*' ? ['inventory:total'] : [])
			stream.push(null)
			return stream
		})
		jest.spyOn(redis, 'unlink').mockImplementation(async (...keys) => {
			await setImmediate()
			return keys.flat().filter((key) => cachedKeys.delete(String(key))).length
		})
		const interceptor = new FlushCacheInterceptor(new Reflector(), redis)
		const route = () => undefined
		SetMetadata(FLUSH_CACHE_PATTERNS, ['inventory:*'])(route)
		const context = new ExecutionContextHost([{}, new EventEmitter()], null, route)
		const next: CallHandler = { handle: () => of([...cachedKeys]) }

		const response = await interceptor.intercept(context, next)

		await expect(firstValueFrom(response)).resolves.toEqual(['orders:total'])
	})
})
