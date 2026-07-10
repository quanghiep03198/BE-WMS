import { env } from '@common/utils'
import { createKeyv, RedisClientOptions } from '@keyv/redis'
import { CacheModuleOptions } from '@nestjs/cache-manager'
import { registerAs } from '@nestjs/config'

export default registerAs(
	'cache',
	() =>
		({
			isGlobal: true,
			nonBlocking: true,
			stores: [
				createKeyv(
					{
						socket: {
							host: env('REDIS_HOST'),
							port: env('REDIS_PORT', { serialize: (value): number => Number.parseInt(value) })
						},
						database: env('REDIS_DB', { fallbackValue: 0, serialize: (value): number => Number.parseInt(value) }),
						password: env('REDIS_PASSWORD')
					},
					{ noNamespaceAffectsAll: false, useUnlink: true }
				)
			]
		}) satisfies CacheModuleOptions<RedisClientOptions>
)
