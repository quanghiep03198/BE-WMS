import { Injectable, Logger } from '@nestjs/common'
import { Job, UnrecoverableError, WaitingError } from 'bullmq'
import { MssqlCircuitService } from './mssql-circuit.service'
import { classifyMssqlError } from './mssql-error.classifier'

@Injectable()
export class MssqlQueueGuard {
	private readonly logger = new Logger(MssqlQueueGuard.name)

	constructor(private readonly circuit: MssqlCircuitService) {}

	async run<T>(dataSourceToken: string, job: Job, token: string | undefined, work: () => Promise<T>): Promise<T> {
		try {
			return await work()
		} catch (error) {
			const kind = classifyMssqlError(error)
			if (kind === 'permanent') {
				const failure = new UnrecoverableError(error instanceof Error ? error.message : String(error))
				failure.cause = error
				throw failure
			}
			const down = kind === 'outage' || (kind === 'suspect' && !(await this.circuit.isHealthy(dataSourceToken)))
			if (!down || !token) throw error
			try {
				await this.circuit.open(
					dataSourceToken,
					job.queueName,
					error instanceof Error ? error.message : String(error)
				)
				await job.moveToWait(token)
			} catch (gateError) {
				this.logger.error(gateError, `Unable to hold job "${job.id}" of "${job.queueName}"`)
				throw error
			}
			throw new WaitingError()
		}
	}
}
