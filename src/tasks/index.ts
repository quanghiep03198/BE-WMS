import { env } from '@common/utils'
import { RotateLogTask } from './rotate-log.task'

export const ScheduleTasks = env('NODE_ENV') === 'production' ? [RotateLogTask] : []
