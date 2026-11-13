import { appendFile } from 'node:fs/promises'

export interface WarehouseSyncStep {
	name: string
	run(): Promise<void>
}

export async function runSteps(
	steps: readonly WarehouseSyncStep[],
	logFile: string,
	writeTerminal: (line: string) => void = (line) => console.log(line),
	shouldContinue?: (step: WarehouseSyncStep, error: unknown) => Promise<boolean>
): Promise<void> {
	async function log(message: string) {
		const line = `${new Date().toISOString()} ${message}`
		writeTerminal(line)
		await appendFile(logFile, `${line}\n`, 'utf8')
	}

	const failures: unknown[] = []
	for (const [index, step] of steps.entries()) {
		await log(`START ${step.name}`)
		try {
			await step.run()
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			await log(`FAIL ${step.name}: ${message}`)
			failures.push(error)
			if (index < steps.length - 1 && shouldContinue && (await shouldContinue(step, error))) {
				await log(`CONTINUE after ${step.name}`)
				continue
			}
			for (const remaining of steps.slice(index + 1)) await log(`NOT_RUN ${remaining.name}`)
			throw error
		}
		await log(`DONE ${step.name}`)
	}
	if (failures.length) throw failures[0]
}
