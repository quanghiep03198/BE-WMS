import { FileLogger } from '@/common/helpers/file-logger.helper'
import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

@Injectable()
export class FileLoggerJobService {
	@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
		name: 'DAILY_ROTATE_LOGS'
	})
	handleRotateLogs() {
		FileLogger.rotate()
	}
}
