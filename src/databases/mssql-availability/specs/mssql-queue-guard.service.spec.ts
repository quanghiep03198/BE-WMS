import { Job, UnrecoverableError, WaitingError } from 'bullmq'
import { QueryFailedError } from 'typeorm'
import { MssqlCircuitService } from '../mssql-circuit.service'
import { MssqlQueueGuard } from '../mssql-queue-guard.service'

const error = (name: string, code: string, number?: number) =>
	new QueryFailedError('SELECT 1', [], Object.assign(new Error(name), { name, code, number }))

describe('MssqlQueueGuard', () => {
	let circuit: { isHealthy: jest.Mock; open: jest.Mock }
	let job: { id: string; queueName: string; moveToWait: jest.Mock }
	let guard: MssqlQueueGuard
	beforeEach(() => {
		circuit = { isHealthy: jest.fn(), open: jest.fn().mockResolvedValue(undefined) }
		job = { id: '1', queueName: 'Q', moveToWait: jest.fn().mockResolvedValue(0) }
		guard = new MssqlQueueGuard(circuit as unknown as MssqlCircuitService)
	})
	const execute = (guard: MssqlQueueGuard, job: object, failure: Error, token: string | undefined = 'token') =>
		guard.run('DATA_LAKE', job as Job, token, () => Promise.reject(failure))

	it('pauses and returns an outage job to waiting without consuming an attempt', async () => {
		await expect(execute(guard, job, error('RequestError', 'EREQUEST', 942))).rejects.toBeInstanceOf(WaitingError)
		expect(circuit.open).toHaveBeenCalledWith('DATA_LAKE', 'Q', expect.any(String))
		expect(job.moveToWait).toHaveBeenCalledWith('token')
		expect(circuit.open.mock.invocationCallOrder[0]).toBeLessThan(job.moveToWait.mock.invocationCallOrder[0])
	})

	it('probes a timeout before pausing and retries a connection error if the database is healthy', async () => {
		circuit.isHealthy.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
		await expect(execute(guard, job, error('RequestError', 'ETIMEOUT'))).rejects.toBeInstanceOf(WaitingError)
		const dropped = error('ConnectionError', 'ESOCKET')
		await expect(execute(guard, job, dropped)).rejects.toBe(dropped)
		expect(circuit.open).toHaveBeenCalledTimes(1)
	})

	it('does not retry a programming or SQL error', async () => {
		const failure = error('RequestError', 'EREQUEST', 208)
		await expect(execute(guard, job, failure)).rejects.toMatchObject({
			name: 'UnrecoverableError',
			message: failure.message,
			cause: failure
		})
		await expect(execute(guard, job, new TypeError('bad data'))).rejects.toBeInstanceOf(UnrecoverableError)
	})

	it('leaves transient and unknown errors to existing retry policy', async () => {
		for (const failure of [error('RequestError', 'EREQUEST', 1205), new Error('unknown')]) {
			await expect(execute(guard, job, failure)).rejects.toBe(failure)
		}
		expect(circuit.open).not.toHaveBeenCalled()
	})

	it('surfaces the original error when pause or requeue fails or there is no lock token', async () => {
		const failure = error('RequestError', 'EREQUEST', 942)
		circuit.open.mockRejectedValueOnce(new Error('redis unavailable'))
		await expect(execute(guard, job, failure)).rejects.toBe(failure)
		job.moveToWait.mockRejectedValueOnce(new Error('lock lost'))
		await expect(execute(guard, job, failure)).rejects.toBe(failure)
		await expect(
			guard.run('DATA_LAKE', job as unknown as Job, undefined, () => Promise.reject(failure))
		).rejects.toBe(failure)
	})
})
