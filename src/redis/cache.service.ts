import { SuperJson } from '@common/utils/json.util'
import { Injectable } from '@nestjs/common'
import Redis from 'ioredis'
import { InjectRedisClient } from './decorators'

type CacheSchema = Record<string, unknown>

interface CachePayload<T> {
	__cache_payload__: true
	data: T
}

interface SetOptions {
	ttlSeconds?: number
	ttlMilliseconds?: number
	expireAtSeconds?: number
	expireAtMilliseconds?: number
}

interface ScanOptions {
	count?: number
}

interface CachePatternEntry<TValue, TKey extends string = string> {
	key: TKey
	value: TValue
}

@Injectable()
export class CacheService<TSchema extends CacheSchema = CacheSchema> {
	constructor(@InjectRedisClient() private readonly redisClient: Redis) {}

	private toPayload<T>(value: T): CachePayload<T> {
		return {
			__cache_payload__: true,
			data: value
		}
	}

	private encode<T>(value: T): string {
		return SuperJson.stringify(this.toPayload(value))
	}

	private decode<T>(value: string | null): T | null {
		if (value === null) return null

		if (!SuperJson.isValid(value)) return null

		const parsed = SuperJson.parse<unknown>(value)
		if (!parsed || typeof parsed !== 'object') return null

		const payload = parsed as Partial<CachePayload<T>>
		if (payload.__cache_payload__ === true && 'data' in payload) {
			return payload.data as T
		}

		// Backward compatibility for legacy data previously stored as plain object JSON.
		return parsed as T
	}

	private async setValue(key: string, value: string, options?: SetOptions): Promise<'OK' | null> {
		if (typeof options?.expireAtMilliseconds === 'number' && options.expireAtMilliseconds > 0) {
			const result = await this.redisClient.call('SET', key, value, 'PXAT', String(options.expireAtMilliseconds))
			return result === null ? null : 'OK'
		}

		if (typeof options?.expireAtSeconds === 'number' && options.expireAtSeconds > 0) {
			const result = await this.redisClient.call('SET', key, value, 'EXAT', String(options.expireAtSeconds))
			return result === null ? null : 'OK'
		}

		if (typeof options?.ttlMilliseconds === 'number' && options.ttlMilliseconds > 0) {
			await this.redisClient.psetex(key, options.ttlMilliseconds, value)
			return 'OK'
		}

		if (typeof options?.ttlSeconds === 'number' && options.ttlSeconds > 0) {
			await this.redisClient.setex(key, options.ttlSeconds, value)
			return 'OK'
		}

		return await this.redisClient.set(key, value)
	}

	public async set<TKey extends keyof TSchema>(
		key: TKey,
		value: TSchema[TKey],
		options?: SetOptions
	): Promise<'OK' | null> {
		const serialized = this.encode(value)
		return await this.setValue(String(key), serialized, options)
	}

	public async setString(key: string, value: string, options?: SetOptions): Promise<'OK' | null> {
		return await this.setValue(key, value, options)
	}

	public async setAt<TKey extends keyof TSchema>(
		key: TKey,
		value: TSchema[TKey],
		expireAtSeconds: number
	): Promise<'OK' | null> {
		return await this.set(key, value, { expireAtSeconds })
	}

	public async setAtMs<TKey extends keyof TSchema>(
		key: TKey,
		value: TSchema[TKey],
		expireAtMilliseconds: number
	): Promise<'OK' | null> {
		return await this.set(key, value, { expireAtMilliseconds })
	}

	public async setStringAt(key: string, value: string, expireAtSeconds: number): Promise<'OK' | null> {
		return await this.setString(key, value, { expireAtSeconds })
	}

	public async setStringAtMs(key: string, value: string, expireAtMilliseconds: number): Promise<'OK' | null> {
		return await this.setString(key, value, { expireAtMilliseconds })
	}

	public async get<TKey extends keyof TSchema>(key: TKey): Promise<TSchema[TKey] | null> {
		const value = await this.redisClient.get(String(key))
		return this.decode<TSchema[TKey]>(value)
	}

	public async getString(key: string): Promise<string | null> {
		return await this.redisClient.get(key)
	}

	public async setIfAbsent<TKey extends keyof TSchema>(
		key: TKey,
		value: TSchema[TKey],
		options?: Omit<SetOptions, 'ttlMilliseconds'>
	): Promise<boolean> {
		const created = await this.redisClient.setnx(String(key), this.encode(value))
		if (created === 1 && typeof options?.ttlSeconds === 'number' && options.ttlSeconds > 0) {
			await this.redisClient.expire(String(key), options.ttlSeconds)
		}

		return created === 1
	}

	public async getMany<TKey extends keyof TSchema>(
		keys: readonly TKey[]
	): Promise<{ [K in TKey]: TSchema[K] | null }> {
		const values = await this.redisClient.mget(...keys.map((key) => String(key)))
		const entries = keys.map((key, index) => [key, this.decode<TSchema[TKey]>(values[index] ?? null)])

		return Object.fromEntries(entries) as { [K in TKey]: TSchema[K] | null }
	}

	public async delete<TKey extends keyof TSchema>(...keys: TKey[]): Promise<number> {
		if (keys.length === 0) return 0
		return await this.redisClient.del(...keys.map((key) => String(key)))
	}

	public async exists<TKey extends keyof TSchema>(...keys: TKey[]): Promise<number> {
		if (keys.length === 0) return 0
		return await this.redisClient.exists(...keys.map((key) => String(key)))
	}

	public async expire<TKey extends keyof TSchema>(key: TKey, ttlSeconds: number): Promise<number> {
		return await this.redisClient.expire(String(key), ttlSeconds)
	}

	public async ttl<TKey extends keyof TSchema>(key: TKey): Promise<number> {
		return await this.redisClient.ttl(String(key))
	}

	public async increment(key: string, by: number = 1): Promise<number> {
		return by === 1 ? await this.redisClient.incr(key) : await this.redisClient.incrby(key, by)
	}

	public async decrement(key: string, by: number = 1): Promise<number> {
		return by === 1 ? await this.redisClient.decr(key) : await this.redisClient.decrby(key, by)
	}

	public async remember<TKey extends keyof TSchema>(
		key: TKey,
		resolver: () => Promise<TSchema[TKey]> | TSchema[TKey],
		options?: SetOptions
	): Promise<TSchema[TKey]> {
		const cached = await this.get(key)
		if (cached !== null) return cached

		const value = await resolver()
		await this.set(key, value, options)
		return value
	}

	public async deleteByPattern(pattern: string): Promise<number> {
		const keys = await this.scanKeys(pattern)
		if (keys.length === 0) return 0
		return await this.redisClient.del(...keys)
	}

	public async scanKeys<TKey extends string = string>(pattern: string, options?: ScanOptions): Promise<TKey[]> {
		const keys: TKey[] = []
		let cursor = '0'
		const count = options?.count ?? 500

		do {
			const [nextCursor, batch] = (await this.redisClient.scan(
				cursor,
				'MATCH',
				pattern,
				'COUNT',
				String(count)
			)) as [string, string[]]

			cursor = nextCursor
			keys.push(...(batch as TKey[]))
		} while (cursor !== '0')

		return keys
	}

	public async getEntriesByPattern<TValue, TKey extends string = string>(
		pattern: string,
		options?: ScanOptions
	): Promise<Array<CachePatternEntry<TValue, TKey>>> {
		const keys = await this.scanKeys<TKey>(pattern, options)
		if (keys.length === 0) return []

		const values = await this.redisClient.mget(...keys)
		const entries: Array<CachePatternEntry<TValue, TKey>> = []

		for (let index = 0; index < keys.length; index++) {
			const decoded = this.decode<TValue>(values[index] ?? null)
			if (decoded === null) continue

			entries.push({
				key: keys[index],
				value: decoded
			})
		}

		return entries
	}

	public getClient(): Redis {
		return this.redisClient
	}
}
