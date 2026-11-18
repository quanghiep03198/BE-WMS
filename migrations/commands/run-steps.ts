import { appendFile } from 'node:fs/promises'
import { Logger } from '../utils/logger'

export interface WarehouseSyncStep {
	name: string
	run(): Promise<void>
}

export async function runSteps(
	steps: readonly WarehouseSyncStep[],
	logFile: string,
	shouldContinue?: (step: WarehouseSyncStep, error: unknown) => Promise<boolean>
): Promise<void> {
	const logger = new Logger('Data Migration')
	async function log(type: 'info' | 'error' | 'warn', message: string) {
		const line = `${new Date().toISOString()} ${message}`
		logger[type](message)
		await appendFile(logFile, `${line}\n`, 'utf8')
	}

	const failures: unknown[] = []
	for (const [index, step] of steps.entries()) {
		await log('info', `[START] ${step.name}`)
		try {
			await step.run()
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			await log('error', `[FAIL] ${step.name}: ${message}`)
			failures.push(error)
			if (index < steps.length - 1 && shouldContinue && (await shouldContinue(step, error))) {
				await log('info', `Continue after ${step.name}`)
				continue
			}
			for (const remaining of steps.slice(index + 1)) await log('warn', `[NOT RUN] ${remaining.name}`)
			throw error
		}
		await log('info', `[DONE] ${step.name}`)
	}
	if (failures.length) throw failures[0]
}
