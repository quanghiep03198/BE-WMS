export function createEpcBatchQueue<T>(concurrency: number, run: (batch: T[]) => Promise<void>) {
	if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('Invalid EPC batch concurrency')
	const active = new Set<Promise<void>>()
	let failure: unknown
	let failed = false
	let closed = false

	return {
		async submit(batch: T[]): Promise<void> {
			if (closed) throw new Error('EPC batch queue is closed')
			while (active.size >= concurrency && !failed) await Promise.race(active)
			if (failed) throw failure
			const job = Promise.resolve()
				.then(() => run(batch))
				.catch((error: unknown) => {
					if (!failed) {
						failed = true
						failure = error
					}
				})
				.finally(() => active.delete(job))
			active.add(job)
		},
		async close(): Promise<void> {
			closed = true
			await Promise.all(active)
			if (failed) throw failure
		}
	}
}
