import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

@Injectable()
export class RotateLogJob {
	@Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT, {
		name: 'MONTHLY_ROTATE_LOGS'
	})
	handleRotateLogs() {
		writeFileSync(resolve('logs/info.log'), '')
		writeFileSync(resolve('logs/error.log'), '')
		writeFileSync(resolve('logs/debug.log'), '')
	}
}
