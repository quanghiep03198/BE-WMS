import { format } from 'date-fns'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isPrimitive } from '../utils/common.util'

export class FileLogger {
	protected static dirPath: string = resolve('logs')
	protected static filePath: string = resolve('logs/app.log')

	public static initialize(): void {
		if (!existsSync(this.dirPath)) {
			mkdirSync(this.dirPath, { recursive: true })
		}
		if (!existsSync(this.filePath)) {
			writeFileSync(this.filePath, '')
		}
	}

	protected static rewrite(log: string) {
		const data = readFileSync(this.filePath).toString().split('\n')
		data.splice(0, 0, log)
		writeFileSync(this.filePath, data.join('\n'))
	}

	protected static format(type: 'Error' | 'Debug' | 'Log', ctx: any) {
		const timestamp: string = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
		if (!isPrimitive(ctx)) ctx = JSON.stringify(ctx, null, 3)

		return `[${timestamp}] ${type}: ${ctx}\n`
	}

	public static error(e: Error) {
		this.rewrite(this.format('Error', e.stack))
	}

	public static debug(arg: any) {
		this.rewrite(this.format('Debug', arg))
	}

	public static log(arg: any) {
		this.rewrite(this.format('Log', arg))
	}
}
