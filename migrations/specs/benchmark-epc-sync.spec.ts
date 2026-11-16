import { assertLocalMongoUri, runEpcBenchmark, summarizeEpcBenchmark } from '../commands/benchmark-epc-sync'

describe('EPC benchmark summary', () => {
	it('refuses remote MongoDB benchmark targets', () => {
		expect(() => assertLocalMongoUri('mongodb://127.0.0.1:27017')).not.toThrow()
		expect(() => assertLocalMongoUri('mongodb://localhost:27017')).not.toThrow()
		expect(() => assertLocalMongoUri('mongodb://remote.example:27017')).toThrow(/local/i)
		expect(() => assertLocalMongoUri('mongodb://127.0.0.1:27017,remote.example:27017')).toThrow(/local/i)
	})

	it('executes each concurrency against a separately prepared run', async () => {
		const seen: number[] = []
		const result = await runEpcBenchmark(8000, async (concurrency) => {
			seen.push(concurrency)
			return { concurrency, rows: 8000, elapsedMs: 1000 / concurrency, fingerprint: 'same' }
		})
		expect(seen).toEqual([1, 2, 4, 8])
		expect(result.results).toHaveLength(4)
	})

	it('reports the first throughput plateau and a 20-million-row estimate', () => {
		const summary = summarizeEpcBenchmark(
			[
				{ concurrency: 1, rows: 8000, elapsedMs: 8000, fingerprint: 'same' },
				{ concurrency: 2, rows: 8000, elapsedMs: 4000, fingerprint: 'same' },
				{ concurrency: 4, rows: 8000, elapsedMs: 3000, fingerprint: 'same' },
				{ concurrency: 8, rows: 8000, elapsedMs: 2900, fingerprint: 'same' }
			],
			8000
		)
		expect(summary.plateauAt).toBe(8)
		expect(summary.estimatedSecondsAtBest).toBe(7250)
	})

	it('does not estimate when the dataset differs or has too few rows', () => {
		const rows = [
			{ concurrency: 1, rows: 8000, elapsedMs: 8000, fingerprint: 'one' },
			{ concurrency: 2, rows: 8000, elapsedMs: 4000, fingerprint: 'two' }
		]
		expect(summarizeEpcBenchmark(rows, 8000)).toMatchObject({ plateauAt: null, estimatedSecondsAtBest: null })
		expect(summarizeEpcBenchmark([{ ...rows[0], rows: 10 }], 8000)).toMatchObject({
			plateauAt: null,
			estimatedSecondsAtBest: null
		})
	})

	it('can compare a consistent partial sample but does not estimate a full run', () => {
		const result = summarizeEpcBenchmark(
			[
				{ concurrency: 1, rows: 7999, elapsedMs: 8000, fingerprint: 'same' },
				{ concurrency: 2, rows: 7999, elapsedMs: 4000, fingerprint: 'same' },
				{ concurrency: 4, rows: 7999, elapsedMs: 3900, fingerprint: 'same' },
				{ concurrency: 8, rows: 7999, elapsedMs: 3800, fingerprint: 'same' }
			],
			8000
		)
		expect(result).toEqual({ plateauAt: 4, estimatedSecondsAtBest: null })
	})
})
