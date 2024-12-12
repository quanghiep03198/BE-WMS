import { format } from 'date-fns'
import { capitalize } from 'lodash'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isPrimitive } from '../utils/common.util'

type LogType = 'error' | 'debug' | 'info'

export class FileLogger {
	protected static dirPath: string = resolve('logs')
	protected static infoLogFilePath: string = resolve('logs/info.log')
	protected static errorLogFilePath: string = resolve('logs/error.log')
	protected static debugLogFilePath: string = resolve('logs/debug.log')

	public static initialize(): void {
		if (!existsSync(this.dirPath)) {
			mkdirSync(this.dirPath, { recursive: true })
		}
		if (!existsSync(this.infoLogFilePath)) writeFileSync(this.infoLogFilePath, '')
		if (!existsSync(this.errorLogFilePath)) writeFileSync(this.errorLogFilePath, '')
		if (!existsSync(this.debugLogFilePath)) writeFileSync(this.debugLogFilePath, '')
	}

	protected static rewrite(type: LogType, log: string) {
		const filePath = (() => {
			switch (type) {
				case 'debug':
					return this.debugLogFilePath
				case 'error':
					return this.errorLogFilePath
				default:
					return this.infoLogFilePath
			}
		})()
		const data = readFileSync(filePath).toString().split('\n')
		data.splice(0, 0, log)
		writeFileSync(filePath, data.join('\n'))
	}

	protected static createLog(type: LogType, ctx: any) {
		const timestamp: string = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
		if (!isPrimitive(ctx)) ctx = JSON.stringify(ctx, null, 3)

		return `[${timestamp}] ${capitalize(type)}: ${ctx}\n`
	}

	public static error(e: Error | unknown) {
		this.rewrite('error', this.createLog('error', e instanceof Error ? e.stack : e))
	}

	public static debug(arg: any) {
		this.rewrite('debug', this.createLog('debug', arg))
	}

	public static info(arg: any) {
		this.rewrite('info', this.createLog('info', arg))
	}

	public static rotate() {
		writeFileSync(this.infoLogFilePath, '')
		writeFileSync(this.debugLogFilePath, '')
		writeFileSync(this.errorLogFilePath, '')
	}
}
