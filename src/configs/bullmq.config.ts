import { env } from '@common/utils'
import { type BullRootModuleOptions } from '@nestjs/bullmq'
import { registerAs } from '@nestjs/config'

export default registerAs(
	'bullmq',
	(): BullRootModuleOptions => ({
		connection: {
			host: env('REDIS_HOST'),
			port: env('REDIS_PORT', { serialize: (value): number => Number.parseInt(value) }),
			password: env('REDIS_PASSWORD'),
			db: env('REDIS_DB', { fallbackValue: 0, serialize: (value): number => Number.parseInt(value) })
		},
		defaultJobOptions: {
			removeOnFail: true,
			removeOnComplete: true,
			attempts: 3,
			backoff: {
				type: 'exponential',
				delay: 3000
			}
		}
	})
)
