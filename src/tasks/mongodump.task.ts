import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { exec } from 'child_process'
import * as path from 'path'

@Injectable()
export class MongoDumpTask {
	private readonly logger = new Logger(MongoDumpTask.name)

	// Ví dụ: Chạy mỗi ngày vào lúc nửa đêm
	@Cron(CronExpression.EVERY_30_MINUTES)
	handleDump() {
		this.logger.log('Starting mongodump ...')

		// Xác định đường dẫn tuyệt đối tới file .ps1 của bạn
		const scriptPath = path.join(__dirname, '../../scripts/mongodump.ps1')

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
