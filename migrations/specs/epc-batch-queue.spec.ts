import { createEpcBatchQueue } from '../helpers/epc-batch-queue'

function deferred() {
	let resolve!: () => void
	let reject!: (error: Error) => void
	const promise = new Promise<void>((success, failure) => {
		resolve = success
		reject = failure
	})
	return { promise, resolve, reject }
}

describe('EPC batch queue', () => {
	it('bounds active batches and waits for capacity', async () => {
		const gates = [deferred(), deferred(), deferred()]
		const started: number[] = []
		const queue = createEpcBatchQueue<number>(2, async ([value]) => {
			started.push(value)
			await gates[value].promise
		})
		await queue.submit([0])
		await queue.submit([1])
		const third = queue.submit([2])
		await Promise.resolve()
		expect(started).toEqual([0, 1])
		gates[1].resolve()
		await third
		expect(started).toEqual([0, 1, 2])
		gates[2].resolve()
		gates[0].resolve()
		await expect(queue.close()).resolves.toBeUndefined()
	})

	it('stops intake on failure and drains already started batches', async () => {
		const gates = [deferred(), deferred()]
		const error = new Error('bulk write failed')
		const started: number[] = []
		const queue = createEpcBatchQueue<number>(2, async ([value]) => {
			started.push(value)
			await gates[value].promise
		})
		await queue.submit([0])
		await queue.submit([1])
		gates[0].reject(error)
		await Promise.resolve()
		await expect(queue.submit([2])).rejects.toBe(error)
		let drained = false
		const close = queue.close().catch((cause) => {
			drained = true
			throw cause
		})
		await Promise.resolve()
		expect(drained).toBe(false)
		gates[1].resolve()
		await expect(close).rejects.toBe(error)
		expect(started).toEqual([0, 1])
	})
})
