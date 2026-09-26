import { env } from '@common/utils'
import { OrderTask } from './order.task'
import { RotateLogTask } from './rotate-log.task'
import { SyncProductSpecificationTask } from './sync-product-specification.task'

export const ScheduleTasks =
	env('NODE_ENV') === 'production' ? [RotateLogTask, SyncProductSpecificationTask, OrderTask] : [OrderTask]
