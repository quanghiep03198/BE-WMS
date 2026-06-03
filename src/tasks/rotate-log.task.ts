import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

@Injectable()
export class RotateLogTask {
	@Cron(CronExpression.EVERY_HOUR, {
		name: 'ROTATE_DEBUG_LOGS_EVERY_DAY_AT_MIDNIGHT'
	})
	handleRotateDebugLogs() {
		writeFileSync(resolve('logs/debug.log'), '')
	}

	@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
		name: 'ROTATE_ERROR_LOGS_EVERY_DAY_AT_MIDNIGHT'
	})
	handleRotateErrorLogs() {
		writeFileSync(resolve('logs/error.log'), '')
	}

	@Cron(CronExpression.EVERY_WEEKEND, { name: 'ROTATE_BACKUP_LOGS_EVERY_WEEKEND' })
	handleRotateBackupLogs() {
		writeFileSync(resolve('logs/backup.log'), '')
	}
}
