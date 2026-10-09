import { format } from 'date-fns'
import { styleText } from 'node:util'

export class Logger {
	constructor(public readonly context?: string) {}

	info(...args: any[]) {
		const params = [styleText('gray', format(new Date(), 'yyyy-MM-dd HH:mm:ss')), ...args]
		if (this.context) params.splice(1, 0, styleText('cyan', `[${this.context}]`))

		console.log(...params)
	}

	error(error: Error | string) {
		const params = [
			styleText('gray', format(new Date(), 'yyyy-MM-dd HH:mm:ss')),
			error instanceof Error ? error.stack || error.message : error
		]
		if (this.context) params.splice(1, 0, styleText('cyan', `[${this.context}]`))

		console.error(...params)
	}
}
