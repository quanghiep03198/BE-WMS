import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

@Injectable()
export class RotateLogJobService {
	@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
		name: 'ROTATE_LOGS_EVERY_DAY_AT_MIDNIGHT'
	})
	handleRotateLogs() {
		writeFileSync(resolve('logs/debug.log'), '')
		writeFileSync(resolve('logs/error.log'), '')
	}
}
