export interface EpcBenchmarkResult {
	concurrency: number
	rows: number
	elapsedMs: number
	fingerprint: string
}

export function assertLocalMongoUri(uri: string): void {
	let parsed: URL
	try {
		parsed = new URL(uri)
	} catch {
		throw new Error('Benchmark MongoDB must be a single local URI')
	}
	if (
		parsed.protocol !== 'mongodb:' ||
		!['localhost', '127.0.0.1'].includes(parsed.hostname.toLowerCase()) ||
		parsed.username ||
		parsed.password ||
		(parsed.searchParams.has('directConnection') && parsed.searchParams.get('directConnection') !== 'true')
	)
		throw new Error('Benchmark MongoDB must be a single local URI')
}

export async function runEpcBenchmark(expectedRows: number, run: (concurrency: number) => Promise<EpcBenchmarkResult>) {
	const results: EpcBenchmarkResult[] = []
	for (const concurrency of [1, 2, 4, 8]) {
		const result = await run(concurrency)
		if (result.concurrency !== concurrency) throw new Error('Invalid benchmark concurrency result')
		results.push(result)
	}
	return { results, ...summarizeEpcBenchmark(results, expectedRows) }
}

export function summarizeEpcBenchmark(results: EpcBenchmarkResult[], expectedRows: number) {
	const comparable =
		results.length === 4 &&
		[1, 2, 4, 8].every((concurrency, index) => results[index].concurrency === concurrency) &&
		results.every(
			(result) =>
				result.rows === results[0].rows &&
				result.rows > 0 &&
				Number.isFinite(result.elapsedMs) &&
				result.elapsedMs > 0 &&
				result.fingerprint === results[0].fingerprint &&
				result.fingerprint.length > 0
		)
	if (!comparable) return { plateauAt: null, estimatedSecondsAtBest: null }
	const speeds = results.map((result) => (result.rows * 1000) / result.elapsedMs)
	const index = speeds.findIndex((speed, i) => i > 0 && speed / speeds[i - 1] < 1.1)
	return {
		plateauAt: index < 0 ? null : results[index].concurrency,
		estimatedSecondsAtBest: results[0].rows === expectedRows ? 20_000_000 / Math.max(...speeds) : null
	}
}
