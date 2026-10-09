import { DefaultJobOptions } from 'bullmq'

export const SYNC_DISPATCH_ORDER_QUEUE = 'SYNC_DISPATCH_ORDER_QUEUE'

export const TRUCKLOAD_DELIVERY_JOB_OPTIONS: DefaultJobOptions = {
	attempts: 10,
	removeOnComplete: { count: 100 },
	removeOnFail: false,
	backoff: { type: 'fixed', delay: 3000 }
}
