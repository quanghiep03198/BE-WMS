import { FileLogger } from '@/common/helpers/file-logger.helper'
import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

@Injectable()
export class RotateLogJob {
	@Cron(CronExpression.EVERY_WEEKEND, {
		name: 'DAILY_ROTATE_LOGS'
	})
	handleRotateLogs() {
		FileLogger.rotate()
	}
}
