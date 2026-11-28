import { getQueueToken } from '@nestjs/bullmq'
import { getDataSourceToken } from '@nestjs/typeorm'
import { Queue, QueueEvents, Worker } from 'bullmq'
import Redis from 'ioredis'
import { randomUUID } from 'node:crypto'
import { MssqlCircuitService } from '../mssql-circuit.service'
import { MssqlQueueGuard } from '../mssql-queue-guard.service'

const integration = process.env.RUN_MSSQL_CIRCUIT_REDIS_TESTS === '1' ? describe : describe.skip

integration('MSSQL circuit with local Redis', () => {
	const connection = { host: '127.0.0.1', port: Number(process.env.MSSQL_CIRCUIT_TEST_REDIS_PORT) }
	let redis: Redis
	let first: Queue
	let second: Queue
	let service: MssqlCircuitService
	let healthy: boolean
	let ds: string
	let moduleRef: { get: (token: string) => unknown }

	beforeEach(async () => {
		if (!Number.isInteger(connection.port) || connection.port < 1024) throw new Error('Invalid local Redis port')
		redis = new Redis(connection)
		ds = `test-${randomUUID()}`
		first = new Queue(`first-${randomUUID()}`, { connection })
		second = new Queue(`second-${randomUUID()}`, { connection })
		healthy = true
		moduleRef = {
			get: (token: string) => {
				if (token === getQueueToken(first.name)) return first
				if (token === getQueueToken(second.name)) return second
				if (token === getDataSourceToken(ds)) return { query: async () => [{ ok: healthy ? 1 : 0 }] }
				throw new Error(`Unknown token ${token}`)
			}
		}
		service = new MssqlCircuitService(
			moduleRef as never,
			redis,
			{ set: jest.fn() } as never,
			{
				inc: jest.fn()
			} as never
		)
		await Promise.all([first.waitUntilReady(), second.waitUntilReady()])
	})

	afterEach(async () => {
		service.onModuleDestroy()
		await Promise.all([first.obliterate({ force: true }), second.obliterate({ force: true })])
		await Promise.all([first.close(), second.close()])
		await redis.srem('mssql:circuit:open', ds)
		await redis.del(`mssql:circuit:${ds}`, `mssql:circuit:${ds}:queues`, `mssql:circuit:${ds}:last`)
		await redis.quit()
	})

	it('pauses the affected queue and recovers after three healthy probes', async () => {
		await first.add('sync', {})
		await service.open(ds, first.name, 'offline')
		expect(await first.isPaused()).toBe(true)
		expect(await redis.smembers(`mssql:circuit:${ds}:queues`)).toEqual([first.name])
		const now = Date.now() + 31_000
		await service.tick(now)
		await service.tick(now)
		expect(await first.isPaused()).toBe(true)
		await service.tick(now)
		expect(await first.isPaused()).toBe(false)
		expect(await redis.sismember('mssql:circuit:open', ds)).toBe(0)
	})

	it('keeps a queue paused by an operator and recovers after restarting the service', async () => {
		await second.pause()
		await service.open(ds, second.name, 'offline')
		await service.open(ds, first.name, 'offline')
		const restarted = new MssqlCircuitService(
			moduleRef as never,
			redis,
			{ set: jest.fn() } as never,
			{
				inc: jest.fn()
			} as never
		)
		for (let i = 0; i < 3; i++) await restarted.tick(Date.now() + 31_000)
		expect(await first.isPaused()).toBe(false)
		expect(await second.isPaused()).toBe(true)
	})

	it('clears an instance metric when another instance closes the circuit', async () => {
		const gauge = { set: jest.fn() }
		const observer = new MssqlCircuitService(moduleRef as never, redis, gauge as never, { inc: jest.fn() } as never)
		await service.open(ds, first.name, 'offline')
		await observer.tick(Date.now())
		expect(gauge.set).toHaveBeenLastCalledWith({ data_source: ds }, 1)
		for (let i = 0; i < 3; i++) await service.tick(Date.now() + 31_000)
		await observer.tick(Date.now() + 31_000)
		expect(gauge.set).toHaveBeenLastCalledWith({ data_source: ds }, 0)
	})

	it('requires consecutive successful probes and backs off after a quick reopening', async () => {
		await service.open(ds, first.name, 'offline')
		const now = Date.now() + 31_000
		await service.tick(Date.now() + 1_000)
		await service.tick(now)
		await service.tick(now)
		healthy = false
		await service.tick(now)
		healthy = true
		await service.tick(now)
		await service.tick(now)
		expect(await first.isPaused()).toBe(true)
		await service.tick(now)
		expect(await first.isPaused()).toBe(false)
		await service.open(ds, first.name, 'offline again')
		expect((await redis.hgetall(`mssql:circuit:${ds}`)).minOpenMs).toBe('60000')
	})

	it('caps the recovery delay after repeated outages', async () => {
		await redis.set(`mssql:circuit:${ds}:last`, '600000', 'PX', 600000)
		await service.open(ds, first.name, 'offline')
		expect((await redis.hgetall(`mssql:circuit:${ds}`)).minOpenMs).toBe('600000')
		for (let i = 0; i < 3; i++) await service.tick(Date.now() + 599_000)
		expect(await first.isPaused()).toBe(true)
		for (let i = 0; i < 3; i++) await service.tick(Date.now() + 601_000)
		expect(await first.isPaused()).toBe(false)
	})

	it('does not resume when a new outage occurs during the recovery probe', async () => {
		await service.open(ds, first.name, 'offline')
		const now = Date.now() + 31_000
		await service.tick(now)
		await service.tick(now)
		const query = jest.spyOn(service, 'isHealthy').mockImplementationOnce(async () => {
			await service.open(ds, second.name, 'new outage')
			return true
		})
		await service.tick(now)
		expect(await first.isPaused()).toBe(true)
		expect(await second.isPaused()).toBe(true)
		expect(await redis.sismember('mssql:circuit:open', ds)).toBe(1)
		query.mockRestore()
	})

	it('does not lose ownership if a queue cannot be resolved during recovery', async () => {
		await service.open(ds, first.name, 'offline')
		await redis.sadd(`mssql:circuit:${ds}:queues`, 'missing')
		for (let i = 0; i < 3; i++) await service.tick(Date.now() + 31_000)
		expect(await redis.sismember('mssql:circuit:open', ds)).toBe(1)
		expect(await redis.sismember(`mssql:circuit:${ds}:queues`, 'missing')).toBe(1)
	})

	it('holds an active job without consuming a retry and processes it after recovery', async () => {
		healthy = false
		const events = new QueueEvents(first.name, { connection })
		const guard = new MssqlQueueGuard(service)
		let calls = 0
		const worker = new Worker(
			first.name,
			(job, token) =>
				guard.run(ds, job, token, async () => {
					calls++
					if (!healthy) throw Object.assign(new Error('offline'), { name: 'ConnectionError', code: 'ESOCKET' })
				}),
			{ connection }
		)
		try {
			await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
			const job = await first.add('sync', {}, { attempts: 3 })
			const deadline = Date.now() + 10_000
			while (!(await first.isPaused()) && Date.now() < deadline)
				await new Promise((resolve) => setTimeout(resolve, 25))
			expect(await first.isPaused()).toBe(true)
			while ((await job.getState()) === 'active' && Date.now() < deadline)
				await new Promise((resolve) => setTimeout(resolve, 25))
			expect(await job.getState()).toBe('waiting')
			expect((await first.getJob(job.id)).attemptsMade).toBe(0)
			healthy = true
			for (let i = 0; i < 3; i++) await service.tick(Date.now() + 31_000)
			await job.waitUntilFinished(events, 10_000)
			expect(calls).toBe(2)
		} finally {
			await worker.close()
			await events.close()
		}
	})
})
