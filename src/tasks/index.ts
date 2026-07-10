import { env } from '@common/utils'
import { AuthTask } from './auth.task'
import { MongoDumpTask } from './mongodump.task'
import { RotateLogTask } from './rotate-log.task'
import { SyncLicensePlateSnapshotTask } from './sync-license-plate-snapshot.task'
import { SyncProductSpecificationTask } from './sync-product-specification.task'

export const ScheduleTasks =
	env('NODE_ENV') === 'production'
		? [AuthTask, MongoDumpTask, RotateLogTask, SyncLicensePlateSnapshotTask, SyncProductSpecificationTask]
		: []
