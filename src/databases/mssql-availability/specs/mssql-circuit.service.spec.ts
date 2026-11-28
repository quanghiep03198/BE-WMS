import { getDataSourceToken } from '@nestjs/typeorm'
import { MssqlCircuitService } from '../mssql-circuit.service'

describe('MssqlCircuitService health checks', () => {
	it('does not prevent application startup when Redis is temporarily unavailable', async () => {
		const redis = { smembers: jest.fn().mockRejectedValue(new Error('redis unavailable')) }
		const service = new MssqlCircuitService({} as never, redis as never, {} as never, {} as never)
		try {
			await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
		} finally {
			service.onModuleDestroy()
		}
	})

	it('shares a pending probe instead of treating concurrent requests as an outage', async () => {
		let resolve: (rows: Array<{ ok: number }>) => void
		const query = jest.fn(
			() =>
				new Promise<Array<{ ok: number }>>((done) => {
					resolve = done
				})
		)
		const moduleRef = { get: (token: string) => (token === getDataSourceToken('DATA_LAKE') ? { query } : undefined) }
		const service = new MssqlCircuitService(moduleRef as never, {} as never, {} as never, {} as never)
		const first = service.isHealthy('DATA_LAKE')
		const second = service.isHealthy('DATA_LAKE')
		resolve([{ ok: 1 }])
		await expect(Promise.all([first, second])).resolves.toEqual([true, true])
		expect(query).toHaveBeenCalledTimes(1)
	})

	it('starts a new probe after timeout so an unresponsive old request cannot prevent recovery', async () => {
		jest.useFakeTimers()
		const query = jest
			.fn()
			.mockReturnValueOnce(new Promise(() => undefined))
			.mockResolvedValueOnce([{ ok: 1 }])
		const service = new MssqlCircuitService(
			{ get: () => ({ query }) } as never,
			{} as never,
			{} as never,
			{} as never
		)
		try {
			const first = service.isHealthy('DATA_LAKE')
			await jest.advanceTimersByTimeAsync(5_000)
			await expect(first).resolves.toBe(false)
			await expect(service.isHealthy('DATA_LAKE')).resolves.toBe(true)
			expect(query).toHaveBeenCalledTimes(2)
		} finally {
			jest.useRealTimers()
		}
	})

	it('does not discard a newer pending probe when an older timed-out probe finally settles', async () => {
		jest.useFakeTimers()
		let resolveOld: (rows: Array<{ ok: number }>) => void
		let resolveNew: (rows: Array<{ ok: number }>) => void
		const query = jest
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveOld = resolve
					})
			)
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveNew = resolve
					})
			)
		const service = new MssqlCircuitService(
			{ get: () => ({ query }) } as never,
			{} as never,
			{} as never,
			{} as never
		)
		try {
			const first = service.isHealthy('DATA_LAKE')
			await jest.advanceTimersByTimeAsync(5_000)
			await expect(first).resolves.toBe(false)
			const second = service.isHealthy('DATA_LAKE')
			resolveOld([{ ok: 1 }])
			await Promise.resolve()
			const third = service.isHealthy('DATA_LAKE')
			resolveNew([{ ok: 1 }])
			await expect(Promise.all([second, third])).resolves.toEqual([true, true])
			expect(query).toHaveBeenCalledTimes(2)
		} finally {
			jest.useRealTimers()
		}
	})
})
