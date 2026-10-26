import { DefaultJobOptions } from 'bullmq'

export const DEFECTIVE_GOODS_SYNC_QUEUE = 'DEFECTIVE_GOODS_SYNC_QUEUE'
export const DEFECTIVE_GOODS_JOB_OPTIONS: DefaultJobOptions = {
	attempts: 10,
	removeOnComplete: { count: 100 },
	removeOnFail: false,
	backoff: { type: 'fixed', delay: 3000 }
}
