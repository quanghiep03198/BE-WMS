import { format } from 'date-fns'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isPrimitive } from '../utils/common.util'

type LogType = 'error' | 'debug' | 'log'

export class FileLogger {
	protected static dirPath: string = resolve('logs')
	protected static logFilePath: string = resolve('logs/logs.log')
	protected static errorLogFilePath: string = resolve('logs/errors.log')
	protected static debugLogFilePath: string = resolve('logs/debug.log')

	public static initialize(): void {
		if (!existsSync(this.dirPath)) {
			mkdirSync(this.dirPath, { recursive: true })
		}
		if (!existsSync(this.logFilePath)) writeFileSync(this.logFilePath, '')
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
					return this.logFilePath
			}
		})()
		const data = readFileSync(filePath).toString().split('\n')
		data.splice(0, 0, log)
		writeFileSync(filePath, data.join('\n'))
	}

	protected static format(type: 'Error' | 'Debug' | 'Log', ctx: any) {
		const timestamp: string = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
		if (!isPrimitive(ctx)) ctx = JSON.stringify(ctx, null, 3)

		return `[${timestamp}] ${type}: ${ctx}\n`
	}

	public static error(e: Error) {
		this.rewrite('error', this.format('Error', e?.stack ?? e))
	}

	public static debug(arg: any) {
		this.rewrite('debug', this.format('Debug', arg))
	}

	public static log(arg: any) {
		this.rewrite('log', this.format('Log', arg))
	}

	public static rotate() {
		writeFileSync(this.logFilePath, '')
		writeFileSync(this.debugLogFilePath, '')
		writeFileSync(this.debugLogFilePath, '')
	}
}
