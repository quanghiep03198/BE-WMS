import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { exec } from 'child_process'
import * as path from 'path'

@Injectable()
export class MongoDumpTask {
	private readonly logger = new Logger(MongoDumpTask.name)

	@Cron(CronExpression.EVERY_10_MINUTES)
	handleDump() {
		const instanceId = process.env.NODE_APP_INSTANCE
		if (instanceId && instanceId !== '0') {
			this.logger.log(`Skipping mongodump on PM2 instance ${instanceId}`)
			return
		}

		this.logger.log('Starting mongodump ...')

		// Path to the PowerShell script that performs mongodump
		const scriptPath = path.resolve('scripts/mongodump.ps1')

		/**
		 * * PowerShell Script:
		 * - ExecutionPolicy Bypass: Skip execution policy to allow running unsigned scripts (use with caution).
		 * - File: Specifies the path to the PowerShell script to execute.
		 */
		const command = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"`

		exec(command, (error, stdout, stderr) => {
			if (error) {
				this.logger.error(error.message)
				return
			}

			if (stderr) {
				this.logger.warn(stderr)
			}

			this.logger.log(stdout)
		})
	}
}
