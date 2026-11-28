import { getQueueToken } from '@nestjs/bullmq'
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { getDataSourceToken } from '@nestjs/typeorm'
import { InjectRedisClient } from '@redis/decorators'
import { InjectMetric } from '@willsoto/nestjs-prometheus'
import { Queue } from 'bullmq'
import Redis from 'ioredis'
import { randomUUID } from 'node:crypto'
import { Counter, Gauge } from 'prom-client'
import { DataSource } from 'typeorm'
import {
	FLAP_WINDOW_MS,
	MAX_MIN_OPEN_MS,
	MIN_OPEN_MS,
	MSSQL_CIRCUIT_OPENED_COUNTER,
	MSSQL_CIRCUIT_OPEN_GAUGE,
	MSSQL_PROBE_SQL,
	PROBE_INTERVAL_MS,
	PROBE_TIMEOUT_MS,
	REQUIRED_HEALTHY_PROBES
} from './constants'

const OPEN_SCRIPT = `
local created = redis.call('EXISTS', KEYS[2]) == 0
if created then
  local last = tonumber(redis.call('GET', KEYS[4]) or '0')
  local min = tonumber(ARGV[4])
  if last > 0 then min = math.min(last * 2, tonumber(ARGV[5])) end
  redis.call('HSET', KEYS[2], 'openedAt', ARGV[1], 'minOpenMs', min)
  redis.call('SADD', KEYS[1], ARGV[2])
end
redis.call('HSET', KEYS[2], 'reason', ARGV[3])
redis.call('HSET', KEYS[2], 'generation', ARGV[7])
if redis.call('HEXISTS', KEYS[7], 'paused') == 0 then
  redis.call('SADD', KEYS[3], ARGV[6])
  if redis.call('EXISTS', KEYS[5]) == 1 then redis.call('RENAME', KEYS[5], KEYS[6]) end
  redis.call('HSET', KEYS[7], 'paused', 1)
  redis.call('DEL', KEYS[8])
  redis.call('XADD', KEYS[9], '*', 'event', 'paused')
end
return created and 1 or 0
`

const RESUME_SCRIPT = `
if redis.call('HGET', KEYS[1], 'generation') ~= ARGV[1] then return 0 end
if redis.call('SISMEMBER', KEYS[2], ARGV[2]) == 0 then return 1 end
local hasJobs = redis.call('EXISTS', KEYS[3]) == 1
if hasJobs then redis.call('RENAME', KEYS[3], KEYS[4]) end
redis.call('HDEL', KEYS[5], 'paused')
if hasJobs or redis.call('ZCARD', KEYS[6]) > 0 then
  redis.call('ZADD', KEYS[9], 0, '0')
else
  local next = redis.call('ZRANGE', KEYS[8], 0, 0, 'WITHSCORES')
  if next[2] then redis.call('ZADD', KEYS[9], tonumber(next[2]) / 0x1000, '1') end
end
redis.call('XADD', KEYS[7], '*', 'event', 'resumed')
redis.call('SREM', KEYS[2], ARGV[2])
return 1
`

const CLOSE_SCRIPT = `
if redis.call('HGET', KEYS[2], 'generation') ~= ARGV[1] or redis.call('SCARD', KEYS[3]) ~= 0 then return 0 end
local min = redis.call('HGET', KEYS[2], 'minOpenMs')
redis.call('SET', KEYS[4], min, 'PX', ARGV[3])
redis.call('DEL', KEYS[2], KEYS[3])
redis.call('SREM', KEYS[1], ARGV[2])
return 1
`

@Injectable()
export class MssqlCircuitService implements OnApplicationBootstrap, OnModuleDestroy {
	private readonly logger = new Logger(MssqlCircuitService.name)
	private readonly healthy = new Map<string, { generation: string; count: number }>()
	private readonly probes = new Map<string, Promise<Array<{ ok: number }>>>()
	private readonly observedOpen = new Set<string>()
	private timer?: NodeJS.Timeout
	private polling = false

	constructor(
		private readonly moduleRef: ModuleRef,
		@InjectRedisClient() private readonly redis: Redis,
		@InjectMetric(MSSQL_CIRCUIT_OPEN_GAUGE) private readonly openGauge: Gauge<string>,
		@InjectMetric(MSSQL_CIRCUIT_OPENED_COUNTER) private readonly openedCounter: Counter<string>
	) {}

	async onApplicationBootstrap(): Promise<void> {
		try {
			for (const ds of await this.redis.smembers('mssql:circuit:open')) {
				this.observedOpen.add(ds)
				this.openGauge.set({ data_source: ds }, 1)
			}
		} catch (error) {
			this.logger.error(error, 'Unable to load MSSQL circuit state; the scheduler will retry')
		}
		this.timer = setInterval(() => {
			if (this.polling) return
			this.polling = true
			void this.tick()
				.catch((error: unknown) => this.logger.error(error, 'MSSQL circuit poll failed'))
				.finally(() => {
					this.polling = false
				})
		}, PROBE_INTERVAL_MS)
	}

	onModuleDestroy(): void {
		if (this.timer) clearInterval(this.timer)
	}

	async isHealthy(dataSourceToken: string): Promise<boolean> {
		let timer: NodeJS.Timeout | undefined
		try {
			let probe = this.probes.get(dataSourceToken)
			if (!probe) {
				const ds = this.moduleRef.get<DataSource>(getDataSourceToken(dataSourceToken), { strict: false })
				probe = ds.query(MSSQL_PROBE_SQL)
				this.probes.set(dataSourceToken, probe)
				const activeProbe = probe
				void probe
					.finally(() => {
						if (this.probes.get(dataSourceToken) === activeProbe) this.probes.delete(dataSourceToken)
					})
					.catch(() => undefined)
			}
			const activeProbe = probe
			const result = await Promise.race([
				probe,
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => {
						if (this.probes.get(dataSourceToken) === activeProbe) this.probes.delete(dataSourceToken)
						reject(new Error('MSSQL probe timed out'))
					}, PROBE_TIMEOUT_MS)
				})
			])
			return result[0]?.ok === 1
		} catch (error) {
			this.logger.warn({ err: error, dataSourceToken }, 'MSSQL probe failed')
			return false
		} finally {
			if (timer) clearTimeout(timer)
		}
	}

	async open(dataSourceToken: string, queueName: string, reason: string): Promise<void> {
		const queue = this.moduleRef.get<Queue>(getQueueToken(queueName), { strict: false })
		const base = `mssql:circuit:${dataSourceToken}`
		const created = await this.redis.eval(
			OPEN_SCRIPT,
			9,
			'mssql:circuit:open',
			base,
			`${base}:queues`,
			`${base}:last`,
			queue.toKey('wait'),
			queue.toKey('paused'),
			queue.toKey('meta'),
			queue.toKey('marker'),
			queue.toKey('events'),
			Date.now(),
			dataSourceToken,
			reason.slice(0, 200),
			MIN_OPEN_MS,
			MAX_MIN_OPEN_MS,
			queueName,
			randomUUID()
		)
		this.openGauge.set({ data_source: dataSourceToken }, 1)
		this.observedOpen.add(dataSourceToken)
		if (created === 1) {
			this.openedCounter.inc({ data_source: dataSourceToken })
			this.logger.error(`MSSQL circuit opened: ${dataSourceToken}`)
		}
	}

	async tick(now = Date.now()): Promise<void> {
		const openSources = new Set(await this.redis.smembers('mssql:circuit:open'))
		for (const ds of this.observedOpen) {
			if (!openSources.has(ds)) {
				this.openGauge.set({ data_source: ds }, 0)
				this.observedOpen.delete(ds)
				this.healthy.delete(ds)
			}
		}
		for (const ds of openSources) {
			this.observedOpen.add(ds)
			const base = `mssql:circuit:${ds}`
			const state = await this.redis.hgetall(base)
			if (!state.generation || !state.openedAt || !state.minOpenMs) {
				this.logger.error(`Invalid MSSQL circuit state for ${ds}`)
				continue
			}
			this.openGauge.set({ data_source: ds }, 1)
			if (now - Number(state.openedAt) < Number(state.minOpenMs)) continue
			const old = this.healthy.get(ds)
			const count = (await this.isHealthy(ds)) ? (old?.generation === state.generation ? old.count : 0) + 1 : 0
			this.healthy.set(ds, { generation: state.generation, count })
			if (count < REQUIRED_HEALTHY_PROBES) continue
			for (const name of await this.redis.smembers(`${base}:queues`)) {
				try {
					const queue = this.moduleRef.get<Queue>(getQueueToken(name), { strict: false })
					await this.redis.eval(
						RESUME_SCRIPT,
						9,
						base,
						`${base}:queues`,
						queue.toKey('paused'),
						queue.toKey('wait'),
						queue.toKey('meta'),
						queue.toKey('prioritized'),
						queue.toKey('events'),
						queue.toKey('delayed'),
						queue.toKey('marker'),
						state.generation,
						name
					)
				} catch (error) {
					this.logger.error(error, `Unable to resume MSSQL queue ${name}`)
				}
			}
			const closed = await this.redis.eval(
				CLOSE_SCRIPT,
				4,
				'mssql:circuit:open',
				base,
				`${base}:queues`,
				`${base}:last`,
				state.generation,
				ds,
				FLAP_WINDOW_MS
			)
			if (closed === 1) {
				this.healthy.delete(ds)
				this.observedOpen.delete(ds)
				this.openGauge.set({ data_source: ds }, 0)
				this.logger.log(`MSSQL circuit closed: ${ds}`)
			}
		}
	}
}
